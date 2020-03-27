import * as search from "./search";
import * as libhttp from "http";
import * as libhttps from "https";
import * as rate_limiter from "../rate_limiter";

interface Request<A> {
	body?: A,
	headers?: libhttp.OutgoingHttpHeaders,
	method?: string,
	url: string
}

interface Response<A> {
	body: A,
	headers: libhttp.IncomingHttpHeaders
}

async function request(request: Request<Buffer>): Promise<Response<Buffer>> {
	return new Promise((resolve, reject) => {
		const client_request = libhttps.request(request.url, {
			headers: request.headers,
			method: request.method
		});
		client_request.on("response", (incoming_message) => {
			incoming_message.setEncoding("binary");
			const buffers = new Array<Buffer>();
			incoming_message.on("data", (chunk) => {
				const buffer = Buffer.from(chunk, "binary");
				buffers.push(buffer);
			});
			incoming_message.on("end", () => {
				const headers = incoming_message.headers;
				const body = Buffer.concat(buffers);
				const response = {
					headers,
					body
				};
				return resolve(response);
			});
		});
		client_request.on("error", (error) => {
			return reject(error);
		});
		if (request.body != null) {
			client_request.end(request.body);
		} else {
			client_request.end();
		}
	});
}

const rl = new rate_limiter.RateLimiter(10000);
const cache: { [key: string]: undefined | Buffer } = {};

async function getSearchResults(query: string, types: Array<search.EntityType>, token?: string): Promise<search.SearchResponse> {
	let url = "https://api.tidal.com/v1/search?query=" + encodeURIComponent(query) + "&limit=3&offset=0&types=" + types.join(",") + "&includeContributors=true&countryCode=SE";
	let buffer = cache[url];
	if (buffer == null) {
		await rl.rateLimit();
		console.log(url);
		let response = await request({
			url: url,
			headers: {
				"x-tidal-token": token || "gsFXkJqGrUNoYMQPZe4k3WKwijnrp8iGSwn3bApe"
			}
		});
		buffer = response.body;
		cache[url] = buffer;
	}
	let string = (buffer as Buffer).toString();
	let json = JSON.parse(string);
	return search.SearchResponse.as(json);
}

async function getCoverArt(id: string): Promise<Buffer> {
	let response = await request({
		url: "https://resources.tidal.com/images/" + id.split("-").join("/") + "/1280x1280.jpg"
	});
	return response.body;
}

export {
	getSearchResults,
	getCoverArt
};
