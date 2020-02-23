type Bitmap = {
	w: number,
	h: number,
	buffer: Buffer,
	palette: Buffer
};

function write_to(bitmap: Bitmap): Buffer {
	let buffers = new Array<Buffer>();
	let stride = (((bitmap.w + 3) >> 2) << 2);
	let bmp_header = Buffer.alloc(14);
	bmp_header.set(Buffer.from("BM", "binary"), 0);
	bmp_header.writeUInt32LE(14 + 40 + 256 * 4 + (stride * bitmap.h), 2);
	bmp_header.writeUInt16LE(0, 6);
	bmp_header.writeUInt16LE(0, 8);
	bmp_header.writeUInt32LE(14 + 40 + 256 * 4, 10);
	buffers.push(bmp_header);
	let dib_header = Buffer.alloc(40);
	dib_header.writeUInt32LE(40, 0);
	dib_header.writeInt32LE(bitmap.w, 4);
	dib_header.writeInt32LE(bitmap.h, 8);
	dib_header.writeUInt16LE(1, 12);
	dib_header.writeUInt16LE(8, 14);
	dib_header.writeUInt32LE(0, 16);
	dib_header.writeUInt32LE((stride * bitmap.h), 20);
	dib_header.writeInt32LE(2835, 24);
	dib_header.writeInt32LE(2835, 28);
	dib_header.writeUInt32LE(0, 32);
	dib_header.writeUInt32LE(0, 36);
	buffers.push(dib_header);
	buffers.push(bitmap.palette);
	for (let y = bitmap.h - 1; y >= 0; y--) {
		let row = Buffer.alloc(stride);
		bitmap.buffer.copy(row, 0, (y * bitmap.w), (y * bitmap.w) + bitmap.w);
		buffers.push(row);
	}
	return Buffer.concat(buffers);
}

function read_from(source: Buffer): Bitmap {
	let bmp_header = source.slice(0, 14);
	let identifier = bmp_header.slice(0, 2);
	if (identifier.toString() !== "BM") {
		throw "";
	}
	let file_size = bmp_header.readUInt32LE(2);
	if (file_size !== source.byteLength) {
		throw "";
	}
	let reserved_a = bmp_header.readUInt16LE(6);
	let reserved_b = bmp_header.readUInt16LE(8);
	let pixel_array_offset = bmp_header.readUInt32LE(10);
	if (pixel_array_offset > source.byteLength) {
		throw "";
	}
	let dib_header = source.slice(14, 14 + source.readUInt32LE(14));
	if (false) {
	} else if (dib_header.byteLength === 40) {
		let signed_width = dib_header.readInt32LE(4);
		let signed_height = dib_header.readInt32LE(8);
		let number_of_color_planes = dib_header.readUInt16LE(12);
		if (number_of_color_planes !== 1) {
			throw "";
		}
		let bits_per_pixel = dib_header.readUInt16LE(14);
		let compression_method = dib_header.readUInt32LE(16);
		if (compression_method !== 0) {
			throw "";
		}
		let pixel_array_size = dib_header.readUInt32LE(20);
		let signed_horizontal_resolution = dib_header.readInt32LE(24);
		let signed_vertical_resolution = dib_header.readInt32LE(28);
		let number_of_palette_colors = dib_header.readUInt32LE(32);
		let number_of_important_colors = dib_header.readUInt32LE(36);
		let w = signed_width;
		let h = signed_height;
		let buffer = source.slice(pixel_array_offset, pixel_array_offset + pixel_array_size);
		let palette = Buffer.alloc(0);
		return {
			w,
			h,
			buffer,
			palette
		}
	} else {
		throw "";
	}
}

export {
	Bitmap,
	write_to,
	read_from
};
