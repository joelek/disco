import * as libfs from "fs";
import * as libhttp from "http";
import * as libhttps from "https";
import * as nsbackup from "./backup";

interface Callback1<T> {
	(value: T): void;
}

function observe_directory(path: string, cb: Callback1<Array<string> | null>): void {
	let interval_ms = 1000;
	let value: Array<string> | null = null;
	let last_update = Date.now();
	setTimeout(function update() {
		libfs.readdir(path, (error, subpaths) => {
			last_update = Date.now();
			value = (error) ? null : subpaths;
			setTimeout(update, interval_ms);
		});
	}, 0);
	let last_report = Date.now();
	setTimeout(function report() {
		last_report = Date.now();
		cb((last_report - last_update < interval_ms) ? value : null);
		setTimeout(report, interval_ms);
	}, 0);
}

function handleEvent(buffer: Buffer, response: libhttp.ServerResponse): void {
	try {
		let body = JSON.parse(buffer.toString("utf8"));
		console.log(body);
		if (false) {
		} else if (body.type === "get_disc_id") {
			nsbackup.compute_digest("F:\\", (digest) => {
				response.end(JSON.stringify({
					type: "set_disc_id",
					disc_id: digest
				}));
			});
		}
	} catch (error) {
		console.log(error);
	}
}

let httpServer = libhttp.createServer((request, response) => {
		response.writeHead(307, {
			"Location": "https://" + request.headers["host"] + request.url
		});
		response.end();
	})
	.listen(80);

let httpsServer = libhttps.createServer({
		cert: libfs.readFileSync("./private/certificate/full_chain.pem"),
		dhparam: libfs.readFileSync("./private/certificate/dhparam.pem"),
		key: libfs.readFileSync("./private/certificate/certificate_key.pem")
	}, (request, response) => {
		let url = request.url;
		console.log(url);
		if (false) {
		} else if (/^[/]$/.test(url)) {
			response.writeHead(200);
			response.end("<!doctype html><html><head><base href=\"/\"/><meta charset=\"utf-8\"/><meta content=\"width=device-width,initial-scale=1.0,minimum-scale=1.0,maximum-scale=1.0\" name=\"viewport\"/></head><body><script>" + libfs.readFileSync("./client.ts") + "</script></body></html>");
		} else if (/^[/]events$/.test(url)) {
			response.writeHead(200);
			request.setEncoding("binary");
			let chunks = new Array<Buffer>();
			request.on("data", (chunk) => {
				chunks.push(Buffer.from(chunk, "binary"));
			});
			request.on("end", () => {
				let buffer = Buffer.concat(chunks);
				handleEvent(buffer, response);
			});
		}
	})
	.listen(443);
