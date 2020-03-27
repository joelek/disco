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
			const now_timestamp_ms = Date.now();
			const delay_ms = now_timestamp_ms >= next_request_timestamp_ms ? 0 : next_request_timestamp_ms - now_timestamp_ms;
			setTimeout(() => {
				this.last_request_timestamp_ms = Date.now();
				return resolve();
			}, delay_ms);
		});
	}
}

export {
	RateLimiter
};
