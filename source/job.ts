interface Callback<A> {
	(value: A): void
}

interface Job {
	getArtifactPath(): string;
	produceArtifact(cb: Callback<string>): void;
}

interface PromiseJob {
	perform(): Promise<void>;
}

export {
	Job,
	PromiseJob
};
