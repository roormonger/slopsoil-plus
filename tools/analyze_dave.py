"""
analyze_dave.py — Decrypt Discord voice UDP packets and inspect DAVE-encrypted payloads.

Usage:
    python tools/analyze_dave.py discord_voice.pcap <secret_key_hex> [video_ssrc]

Example:
    python tools/analyze_dave.py ~/discord_voice.pcap aabbcc...3344 787

The secret key hex comes from the bot log line:
    Session: mode=aead_xchacha20_poly1305_rtpsize key=<hex>

If video_ssrc is omitted, the script prints a summary of all SSRCs seen so you can
identify the official client's video SSRC.  Then re-run with the SSRC to dump the
raw DAVE-encrypted payloads for that stream.
"""

from __future__ import annotations

import struct
import sys
from collections import defaultdict

import nacl.secret


# ---------------------------------------------------------------------------
# Minimal pcap reader (no scapy dependency)
# ---------------------------------------------------------------------------

PCAP_GLOBAL_HEADER = 24
PCAP_PKT_HEADER = 16

_LINK_EN10MB = 1
_LINK_LINUX_SLL = 113
_LINK_RAW = 101


def _iter_pcap(path: str):
    """Yield (ts_sec, ts_usec, data) for each packet in a pcap file."""
    with open(path, "rb") as f:
        magic = f.read(4)
        if magic == b"\xd4\xc3\xb2\xa1":
            endian = "<"
        elif magic == b"\xa1\xb2\xc3\xd4":
            endian = ">"
        else:
            raise ValueError(f"Not a pcap file (magic={magic.hex()})")
        header = f.read(20)
        ver_maj, ver_min, thiszone, sigfigs, snaplen, network = struct.unpack(
            f"{endian}HHiIII", header
        )
        while True:
            pkt_hdr = f.read(PCAP_PKT_HEADER)
            if not pkt_hdr:
                break
            ts_sec, ts_usec, caplen, origlen = struct.unpack(f"{endian}IIII", pkt_hdr)
            data = f.read(caplen)
            yield ts_sec, ts_usec, data, network


def _extract_udp_payload(data: bytes, network: int) -> bytes | None:
    """Strip Ethernet/IP/UDP headers and return UDP payload, or None."""
    try:
        if network == _LINK_EN10MB:
            eth_type = (data[12] << 8) | data[13]
            if eth_type == 0x0800:  # IPv4
                ip = data[14:]
            elif eth_type == 0x86DD:  # IPv6
                ip = data[14:]
            else:
                return None
            ip_hdr_len = (ip[0] & 0xF) * 4
            if ip[9] != 17:  # not UDP
                return None
            udp = ip[ip_hdr_len:]
        elif network == _LINK_LINUX_SLL:
            proto = (data[14] << 8) | data[15]
            if proto == 0x0800:
                ip = data[16:]
            else:
                return None
            ip_hdr_len = (ip[0] & 0xF) * 4
            if ip[9] != 17:
                return None
            udp = ip[ip_hdr_len:]
        elif network == _LINK_RAW:
            ip = data
            ip_hdr_len = (ip[0] & 0xF) * 4
            if ip[9] != 17:
                return None
            udp = ip[ip_hdr_len:]
        else:
            return None
        return udp[8:]  # skip UDP header (8 bytes)
    except (IndexError, struct.error):
        return None


# ---------------------------------------------------------------------------
# RTP / outer decryption
# ---------------------------------------------------------------------------

def _parse_rtp_header(pkt: bytes) -> tuple[int, int, int, int] | None:
    """Return (version, seq, ts, ssrc) from a 12-byte RTP header, or None."""
    if len(pkt) < 12:
        return None
    version = (pkt[0] >> 6) & 3
    if version != 2:
        return None
    seq = struct.unpack_from(">H", pkt, 2)[0]
    ts = struct.unpack_from(">I", pkt, 4)[0]
    ssrc = struct.unpack_from(">I", pkt, 8)[0]
    return version, seq, ts, ssrc


def _outer_decrypt(pkt: bytes, key: bytes) -> bytes | None:
    """
    Decrypt a Discord voice UDP packet encrypted with aead_xchacha20_poly1305_rtpsize.

    Packet format:  [RTP header (12 B)] [ciphertext] [nonce suffix (4 B)]
    Header is AAD; ciphertext includes the 16-byte Poly1305 auth tag.
    """
    if len(pkt) < 12 + 4:
        return None
    header = pkt[:12]
    nonce_suffix = pkt[-4:]
    ciphertext = pkt[12:-4]
    if not ciphertext:
        return None
    nonce = nonce_suffix + b"\x00" * 20  # pad to 24 bytes
    box = nacl.secret.Aead(key)
    try:
        return box.decrypt(ciphertext, header, nonce)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Main analysis
# ---------------------------------------------------------------------------

def _hex_preview(data: bytes, n: int = 64) -> str:
    preview = data[:n].hex()
    if len(data) > n:
        preview += f"... ({len(data)} bytes total)"
    return preview


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    pcap_path = sys.argv[1]
    key = bytes.fromhex(sys.argv[2])
    target_ssrc: int | None = int(sys.argv[3]) if len(sys.argv) >= 4 else None

    ssrc_counts: dict[int, int] = defaultdict(int)
    ssrc_pt: dict[int, set] = defaultdict(set)

    frame_count = 0
    shown = 0
    max_show = 20  # how many DAVE payloads to print

    print(f"Reading {pcap_path} ...")
    for ts_sec, ts_usec, raw, network in _iter_pcap(pcap_path):
        udp_payload = _extract_udp_payload(raw, network)
        if udp_payload is None:
            continue
        parsed = _parse_rtp_header(udp_payload)
        if parsed is None:
            continue
        _, seq, ts, ssrc = parsed
        pt = udp_payload[1] & 0x7F
        ssrc_counts[ssrc] += 1
        ssrc_pt[ssrc].add(pt)

        if target_ssrc is not None and ssrc != target_ssrc:
            continue

        # Attempt outer decryption
        decrypted = _outer_decrypt(udp_payload, key)
        if decrypted is None:
            continue

        frame_count += 1

        if shown < max_show:
            print(f"\n--- Packet #{frame_count}  seq={seq}  ts={ts}  ssrc={ssrc}  pt={pt}")
            print(f"    outer-decrypted payload ({len(decrypted)} bytes):")
            print(f"    {_hex_preview(decrypted, 128)}")
            # Try to detect SFrame header: typically starts with a header byte
            # that encodes key_id and counter length, followed by a counter.
            # Common SFrame pattern: first byte has low 3 bits = counter_length,
            # bits 3-5 = key_id (or extended), bit 7 = reserved
            if decrypted:
                first = decrypted[0]
                print(f"    first byte: 0x{first:02x}  (bits: {first:08b})")
                # SFrame R bit (bit 7 should be 0), K bit (bit 6 = extended key id),
                # LEN bits 5-4 = counter len - 1, KID bits 3-0 = key id
                sframe_r = (first >> 7) & 1
                sframe_k = (first >> 6) & 1
                sframe_len = ((first >> 4) & 0x3) + 1
                sframe_kid = first & 0xF
                print(
                    f"    if SFrame hdr: R={sframe_r} K={sframe_k} "
                    f"counter_len={sframe_len} key_id={sframe_kid}"
                )
            shown += 1

    print(f"\n{'='*60}")
    print(f"SSRCs seen (SSRC → packet count, payload types):")
    for s, cnt in sorted(ssrc_counts.items(), key=lambda x: -x[1]):
        print(f"  SSRC {s:10d} ({s:#010x})  {cnt:5d} pkts  PT={sorted(ssrc_pt[s])}")

    if target_ssrc is not None:
        print(f"\nDecrypted {frame_count} packets for SSRC {target_ssrc}")
        print(f"Showed first {shown} payloads above.")


if __name__ == "__main__":
    main()
