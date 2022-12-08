import * as stdlib from "@joelek/ts-stdlib";

export enum Tag {
	Make = 0x010F,
	Model = 0x0110,
	ExposureTime = 0x829A,
	FNumber = 0x829D,
	ExifOffset = 0x8769,
	ISOSpeedRatings = 0x8827,
	DateTimeOriginal = 0x9003,
	OffsetTimeOriginal = 0x9011,
	ExposureBiasValue = 0x9204,
	FocalLength = 0x920A,
	ExifImageWidth = 0xA002,
	ExifImageHeight = 0xA003,
	LensMake = 0xA433,
	LensModel = 0xA434
};

export enum Format {
	UNDEFINED_0 = 0,
	UNSIGNED_1 = 1,
	ASCII = 2,
	UNSIGNED_2 = 3,
	UNSIGNED_4 = 4,
	UNSIGNED_RATIONAL = 5,
	SIGNED_1 = 6,
	UNDEFINED_7 = 7,
	SIGNED_2 = 8,
	SIGNED_4 = 9,
	SIGNED_RATIONAL = 10,
	REAL_4 = 11,
	REAL_8 = 12,
	UNDEFINED_13 = 1,
	UNDEFINED_14 = 1,
	UNDEFINED_15 = 1,
};

const BYTES_PER_COMPONENT = {
	[Format.UNDEFINED_0]: 1,
	[Format.UNSIGNED_1]: 1,
	[Format.ASCII]: 1,
	[Format.UNSIGNED_2]: 2,
	[Format.UNSIGNED_4]: 4,
	[Format.UNSIGNED_RATIONAL]: 8,
	[Format.SIGNED_1]: 1,
	[Format.UNDEFINED_7]: 1,
	[Format.SIGNED_2]: 2,
	[Format.SIGNED_4]: 4,
	[Format.SIGNED_RATIONAL]: 8,
	[Format.REAL_4]: 4,
	[Format.REAL_8]: 8,
	[Format.UNDEFINED_13]: 1,
	[Format.UNDEFINED_14]: 1,
	[Format.UNDEFINED_15]: 1,
};

export type TiffHeaderEntry = [Tag, Format, Uint8Array];

export type TiffHeaderDirectory = Array<TiffHeaderEntry>;

export type TiffHeader = {
	directories: Array<TiffHeaderDirectory>;
};

export function parseTiffHeader(parser: Uint8Array | stdlib.data.parser.Parser): TiffHeader {
	parser = parser instanceof stdlib.data.parser.Parser ? parser : new stdlib.data.parser.Parser(parser);
	return parser.try((parser) => {
		let endianness = parser.string("binary", 2);
		let endian: "big" | "little" = "big";
		if (endianness === "MM") {
			endian = "big";
		} else if (endianness === "II") {
			endian = "little";
		} else {
			throw new Error(`Expected a valid EXIF endianness!`);
		}
		if (parser.unsigned(2, endian) !== 0x002A) {
			throw new Error(`Expected tag 0x002A!`);
		}
		let directories = [] as Array<TiffHeaderDirectory>;
		let offset = parser.unsigned(4, endian);
		while (offset !== 0) {
			parser.seek(offset);
			let directory = [] as TiffHeaderDirectory;
			let count = parser.unsigned(2, endian);
			for (let i = 0; i < count; i++) {
				let tag = parser.unsigned(2, endian);
				let format = parser.unsigned(2, endian);
				let components = parser.unsigned(4, endian);
				let data = parser.chunk(4);
				let length = components * BYTES_PER_COMPONENT[format as Format];
				if (length > 4) {
					//parser.save();
					let originalOffset = (parser as any).offset;
					let offset = new stdlib.data.parser.Parser(data).unsigned(4, endian);
					parser.seek(offset);
					data = parser.chunk(length);
					parser.seek(originalOffset);
					//parser.restore();
				}
				directory.push([tag, format, data]);
			}
			offset = parser.unsigned(4, endian);
			directories.push(directory);
			let entry = directory.find(([tag]) => tag === Tag.ExifOffset);
			if (entry != null) {
				let offset = new stdlib.data.parser.Parser(entry[2]).unsigned(4, endian);
			}
		}
		return {
			directories
		};
	});
};

export enum Marker {
	START_OF_IMAGE = 0xFFD8,
	END_OF_IMAGE = 0xFFD9,
	APPLICATION_0 = 0xFFE0,
	APPLICATION_1 = 0xFFE1,
	START_OF_SCAN = 0xFFDA,
	START_OF_FRAME_0 = 0xFFC0,
	DEFINE_QUANTIZATION_TABLE = 0xFFDB,
	DEFINE_HUFFMAN_TABLE = 0xFFC4,
};

export function isFixedWidth(marker: Marker): boolean {
	return ![Marker.START_OF_IMAGE, Marker.END_OF_IMAGE, Marker.START_OF_SCAN].includes(marker);
};

export type StartOfImage = {

};

export function parseStartOfImage(parser: Uint8Array | stdlib.data.parser.Parser): StartOfImage {
	parser = parser instanceof stdlib.data.parser.Parser ? parser : new stdlib.data.parser.Parser(parser);
	return parser.try((parser) => {
		return {};
	});
};

export type EndOfImage = {

};

export function parseEndOfImage(parser: Uint8Array | stdlib.data.parser.Parser): EndOfImage {
	parser = parser instanceof stdlib.data.parser.Parser ? parser : new stdlib.data.parser.Parser(parser);
	return parser.try((parser) => {
		return {};
	});
};

export type Application0 = {
	major: number;
	minor: number;
	units: number;
	x: number;
	y: number;
	w: number;
	h: number;
	preview: Uint8Array;
} | {
	format: 10;
	jpeg: Uint8Array;
} | {
	format: 11;
	w: number;
	h: number;
	palette: Uint8Array;
	data: Uint8Array;
} | {
	format: 13;
	w: number;
	h: number;
	data: Uint8Array;
};

export function parseApplication0(parser: Uint8Array | stdlib.data.parser.Parser): Application0 {
	parser = parser instanceof stdlib.data.parser.Parser ? parser : new stdlib.data.parser.Parser(parser);
	return parser.tryArray<Application0>([
		(parser) => {
			if (parser.string("binary") !== "JFIF") {
				throw new Error(`Expected a JFIF tag!`);
			}
			let major = parser.unsigned(1, "big");
			let minor = parser.unsigned(1, "big");
			let units = parser.unsigned(1, "big");
			if ((units !== 0) && (units !== 1) && (units !== 2)) {
				throw new Error(`Expected a valid density unit!`);
			}
			let x = parser.unsigned(2, "big");
			if (x === 0) {
				throw new Error(`Expected a non-zero horisontal resolution!`);
			}
			let y = parser.unsigned(2, "big");
			if (y === 0) {
				throw new Error(`Expected a non-zero vertical resolution!`);
			}
			let w = parser.unsigned(1, "big");
			let h = parser.unsigned(1, "big");
			let preview = parser.chunk(w * h * 3);
			return {
				major,
				minor,
				units,
				x,
				y,
				w,
				h,
				preview
			};
		},
		(parser) => {
			if (parser.string("binary") !== "JFXX") {
				throw new Error(`Expected a JFXX tag!`);
			}
			let format = parser.unsigned(1, "big");
			if (format === 10) {
				let jpeg = parser.chunk();
				return {
					format,
					jpeg
				};
			}
			if (format === 11) {
				let w = parser.unsigned(1, "big");
				if (w === 0) {
					throw new Error(`Expected a non-zero horisontal resolution!`);
				}
				let h = parser.unsigned(1, "big");
				if (h === 0) {
					throw new Error(`Expected a non-zero vertical resolution!`);
				}
				let palette = parser.chunk(256 * 3);
				let data = parser.chunk(w * h *  1);
				return {
					format,
					w,
					h,
					palette,
					data
				};
			}
			if (format === 13) {
				let w = parser.unsigned(1, "big");
				if (w === 0) {
					throw new Error(`Expected a non-zero horisontal resolution!`);
				}
				let h = parser.unsigned(1, "big");
				if (h === 0) {
					throw new Error(`Expected a non-zero vertical resolution!`);
				}
				let data = parser.chunk(w * h *  3);
				return {
					format,
					w,
					h,
					data
				};
			}
			throw new Error(`Expected a valid thumbnail format!`);
		}
	]);
};

export type Application1 = {
	tiff: TiffHeader;
};

export function parseApplication1(parser: Uint8Array | stdlib.data.parser.Parser): Application1 {
	parser = parser instanceof stdlib.data.parser.Parser ? parser : new stdlib.data.parser.Parser(parser);
	return parser.try((parser) => {
		if (parser.string("binary") !== "Exif" || parser.unsigned(1, "big") !== 0) {
			throw new Error(`Expected a JFXX tag!`);
		}
		let tiff = parseTiffHeader(parser.chunk());
		return {
			tiff
		};
	});
};

export type StartOfFrame0Component = {
	id: number;
	sampling_factors: number;
	quantization_table: number;
};

export type StartOfFrame0 = {
	precision: number;
	height: number;
	width: number;
	component_count: number;
	components: Array<StartOfFrame0Component>;
};

export function parseStartOfFrame0(parser: Uint8Array | stdlib.data.parser.Parser): StartOfFrame0 {
	parser = parser instanceof stdlib.data.parser.Parser ? parser : new stdlib.data.parser.Parser(parser);
	let precision = parser.unsigned(1, "big");
	let height = parser.unsigned(2, "big");
	let width = parser.unsigned(2, "big");
	let component_count = parser.unsigned(1, "big");
	let components = [] as Array<StartOfFrame0Component>;
	for (let i = 0; i < component_count; i++) {
		let id = parser.unsigned(1, "big");
		let sampling_factors = parser.unsigned(1, "big");
		let quantization_table = parser.unsigned(1, "big");
		let component: StartOfFrame0Component = {
			id,
			sampling_factors,
			quantization_table
		};
		components.push(component);
	}
	return {
		precision,
		height,
		width,
		component_count,
		components
	};
};

const PARSERS = {
	[Marker.START_OF_IMAGE]: parseStartOfImage,
	[Marker.APPLICATION_0]: parseApplication0,
	[Marker.APPLICATION_1]: parseApplication1,
	[Marker.START_OF_FRAME_0]: parseStartOfFrame0,
	[Marker.END_OF_IMAGE]: parseEndOfImage
};

export type Segment = {
	[B in keyof typeof PARSERS]: [B, ReturnType<typeof PARSERS[B]>];
}[keyof typeof PARSERS];

export function parseSegments(parser: Uint8Array | stdlib.data.parser.Parser): Array<Segment> {
	parser = parser instanceof stdlib.data.parser.Parser ? parser : new stdlib.data.parser.Parser(parser);
	return parser.try((parser) => {
		let segments = [] as Array<Segment>;
		while (true) {
			let marker = parser.unsigned(2, "big");
			let subparser = isFixedWidth(marker) ? parser.chunk(parser.unsigned(2, "big") - 2) : parser;
			if (marker in PARSERS) {
				segments.push([marker, PARSERS[marker as keyof typeof PARSERS](subparser)])
			}
			if (marker === Marker.END_OF_IMAGE || marker === Marker.START_OF_SCAN) {
				break;
			}
		}
		return segments;
	});
};

import * as fs from "fs";

console.log(JSON.stringify(parseSegments(fs.readFileSync("d.jpg")), null, 2));
