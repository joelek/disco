import * as search from "./search";
import * as libhttp from "http";
import * as libhttps from "https";

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

class RateLimiter {
	private average_request_time_ms: number;
	private last_request_timestamp_ms: number;

	constructor(average_request_time_ms: number) {
		this.average_request_time_ms = average_request_time_ms;
		this.last_request_timestamp_ms = 0;
	}

	async rateLimit(): Promise<void> {
		return new Promise((resolve, reject) => {
			const next_request_delay = Math.round(this.average_request_time_ms * (0.5 + Math.random()));
			const next_request_timestamp_ms = this.last_request_timestamp_ms + next_request_delay;
			const delay_ms = next_request_timestamp_ms - Date.now();
			if (delay_ms > 0) {
				setTimeout(() => {
					this.last_request_timestamp_ms = Date.now();
					return resolve();
				}, delay_ms);
			} else {
				return resolve();
			}
		});
	}
}

const rate_limiter = new RateLimiter(10000);

async function getSearchResults(query: string, types: Array<search.EntityType>, token?: string): Promise<search.SearchResponse> {
	await rate_limiter.rateLimit();
	let response = await request({
		url: "https://api.tidal.com/v1/search?query=" + encodeURIComponent(query) + "&limit=3&offset=0&types=" + types.join(",") + "&includeContributors=true&countryCode=SE",
		headers: {
			"x-tidal-token": token || "gsFXkJqGrUNoYMQPZe4k3WKwijnrp8iGSwn3bApe"
		}
	});
	let string = response.body.toString();
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
