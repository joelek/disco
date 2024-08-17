/*











MDF/MDS:

little endian
first 150 sectors are not stored in MDF but gaps between are
supports storing of DPM and sub sectors (not all files contain them)
layers, sessions?
V1.3
V1.5 has 16byte chars in strings

16 bytes start "MEDIA DESCRIPTOR"
01 03 00 00 01 00 02 00 - 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 - 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 - 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 - 00 00 00 00 00 00 00 00
58 00 00 00 (4 byte, abs offset to 28 B footer section in some protected games, probably read error sectors) - (pregap correction 4 bytes, 0 or -150) (4 bytes sectors in image)
01 00 *4 03 01 00 TC 00 - 00 00 00 00 (4 byte abs offset to 0x70)

@0x70:
3x80 bytes

@0x160: (section for first track)
AA 00 14 00 TN 00 00 00 (4 byte msf start, 2 seconds) (4 bytes abs offset to sector record track 1)
(4 byte raw sector size) 00 00 00 00 - 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 - 00 00 00 00 00 00 00 00
01 00 00 00 (4 bytes absolute offset to 16 byte post at end) 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 - 00 00 00 00 00 00 00 00

@0x1B0: (optional section for second track)
A9 00 10 00 TN 00 00 00 (4 byte msf start, 0xE minutes, 0x1D seconds, 0x13 frames) (4 bytes abs offset to sector record track 2)
(4 byte raw sector size) 00 00 00 00 - 00 00 00 00 00 00 00 00
00 00 00 00 (4 byte sector start number, absolute?) - A0 F5 18 09 00 00 00 00
01 00 00 00 (4 bytes absolute offset to 16 byte post at end) 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 - 00 00 00 00 00 00 00 00

@0x6B0/0x1B0: (after track sections) END marker
00 00 00 00 00 00 00 00 - 00 00 00 00 00 00 00 00



8 byte entry per track at end (sector record)
	4 byte pregap sectors
	4 byte length sectors
16 byte post
	4 byte absolute offset to filename string

*/
