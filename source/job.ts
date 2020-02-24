interface Callback<A> {
	(value: A): void
}

interface Job {
	getArtifactPath(): string;
	produceArtifact(cb: Callback<string>): void;
}

export {
	Job
};
