import * as libcrypto from "crypto";
import * as libfs from "fs";
import * as libpath from "path";

interface Callback<A> {
	(value: A): void
}

function compute_digest(path: string, cb: Callback<string>): void {
	libfs.stat(path, (error, stat) => {
		if (error) {
			throw "";
		}
		if (stat.isFile()) {
			let buffer = Buffer.alloc(24);
			buffer.writeBigUInt64BE(BigInt(stat.size), 0);
			buffer.writeBigUInt64BE(BigInt(stat.ctimeMs), 8);
			buffer.writeBigUInt64BE(BigInt(stat.mtimeMs), 16);
			let hash = libcrypto.createHash("sha256");
			hash.update(buffer);
			let digest = hash.digest("hex");
			cb(digest);
		} else if (stat.isDirectory()) {
			libfs.readdir(path, (error, subpaths) => {
				if (error) {
					throw "";
				}
				subpaths = subpaths
					.map((subpath) => {
						return Buffer.from(subpath, "utf8");
					})
					.sort()
					.map((buffer) => {
						return buffer.toString("utf8");
					});
				let hash = libcrypto.createHash("sha256");
				let iterator = () => {
					if (subpaths.length > 0) {
						let subpath = subpaths.shift();
						compute_digest(libpath.join(path, subpath), (digest) => {
							let buffer = Buffer.from(subpath, "utf8");
							hash.update(buffer);
							hash.update(digest);
							iterator();
						});
					} else {
						let digest = hash.digest("hex");
						cb(digest);
					}
				};
				iterator();
			});
		} else {
			throw "";
		}
	});
}

export {
	compute_digest
};
