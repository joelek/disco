type MatchState = "y" | "n" | "?";

interface Matcher {
	matches(): MatchState;
	reset(): void;
	update(char: string): void;
}

function test(expected: MatchState, string: string, matcher: Matcher): void {
	for (let char of string) {
		matcher.update(char);
	}
	if (matcher.matches() !== expected) {
		throw {
			expected,
			string,
			matcher
		};
	}
}

class CharMatcher implements Matcher {
	private string: string;
	private state: MatchState;

	constructor(string: string) {
		this.string = string;
		this.reset();
	}

	matches(): MatchState {
		return this.state;
	}

	reset(): void {
		this.state = "?";
	}

	update(char: string): void {
		if (this.state !== "n") {
			if (this.state === "y") {
				this.state = "n";
			} else {
				if (this.string.indexOf(char) >= 0) {
					this.state = "y";
				} else {
					this.state = "n";
				}
			}
		}
	}
}

class WordMatcher implements Matcher {
	private string: string;
	private offset: number;
	private state: MatchState;

	constructor(string: string) {
		this.string = string;
		this.reset();
	}

	matches(): MatchState {
		return this.state;
	}

	reset(): void {
		this.offset = 0;
		this.state = "?";
	}

	update(char: string): void {
		if (this.matches() !== "n") {
			if (this.offset >= this.string.length) {
				this.state = "n";
			} else {
				if (this.string[this.offset++] !== char) {
					this.state = "n";
				} else {
					this.state = (this.offset === this.string.length ? "y" : "?");
				}
			}
		}
	}
}

class OrMatcher implements Matcher {
	private original: Iterable<Matcher>;
	private matchers: Array<Matcher>;

	constructor(original: Iterable<Matcher>) {
		this.original = original;
		this.reset();
	}

	matches(): MatchState {
		if (this.matchers.length === 1) {
			return this.matchers[0].matches();
		}
		for (let matcher of this.matchers) {
			if (matcher.matches() !== "n") {
				return "?";
			}
		}
		return "n";
	}

	reset(): void {
		this.matchers = Array.from(this.original);
		for (let matcher of this.matchers) {
			matcher.reset();
		}
	}

	update(char: string): void {
		if (this.matches() !== "n") {
			let matchers = new Array<Matcher>();
			for (let matcher of this.matchers) {
				matcher.update(char);
				if (matcher.matches() !== "n") {
					matchers.push(matcher);
				}
			}
			this.matchers = matchers;
		}
	}
}

class RepeatMatcher implements Matcher {
	private min: number;
	private max: number;
	private matcher: Matcher;
	private repetitions: number;
	private updated: boolean;

	constructor(min: number, max: number, matcher: Matcher) {
		if (min < 0) {
			throw "Expected a non-negative number!";
		}
		if (max < 0) {
			throw "Expected a non-negative number!";
		}
		this.min = Math.min(min, max);
		this.max = Math.max(min, max);
		this.matcher = matcher;
		this.reset();
	}

	matches(): MatchState {
		let state = this.matcher.matches();
		if (state === "n") {
			return "n";
		}
		if (this.repetitions < this.min) {
			return "?";
		}
		if (this.repetitions > this.max) {
			return "n";
		}
		if (this.repetitions === this.max) {
			if (this.updated) {
				return "n";
			}
			return "y";
		}
		if (this.updated) {
			return "?"
		}
		return "y";
	}

	reset(): void {
		this.matcher.reset();
		this.repetitions = 0;
		this.updated = false;
	}

	update(char: string): void {
		if (this.matches() !== "n") {
			this.matcher.update(char);
			this.updated = true;
			if (this.matcher.matches() === "y") {
				this.repetitions += 1;
				this.matcher.reset();
				this.updated = false;
			}
		}
	}
}

class ConcatMatcher implements Matcher {
	private original: Iterable<Matcher>;
	private matchers: Array<Matcher>;
	private accepted: number;
	private state: MatchState;

	constructor(original: Iterable<Matcher>) {
		this.original = original;
		this.reset();
	}

	matches(): MatchState {
		return this.state;
	}

	reset(): void {
		this.matchers = Array.from(this.original);
		this.accepted = 0;
		this.state = "?";
		for (let matcher of this.matchers) {
			matcher.reset();
		}
	}

	update(char: string): void {
		if (this.matches() !== "n") {
			if (this.accepted === this.matchers.length) {
				this.state = "n";
			} else {
				let matcher = this.matchers[this.accepted];
				matcher.update(char);
				let state = matcher.matches();
				if (state === "n") {
					this.state = "n";
				} else {
					if (state === "y") {
						this.accepted += 1;
						if (this.accepted === this.matchers.length) {
							this.state = "y";
						}
					}
				}
			}
		}
	}
}

let ns = {
	char(string: string): CharMatcher {
		return new CharMatcher(string);
	},
	word(string: string): WordMatcher {
		return new WordMatcher(string);
	},
	concat(original: Iterable<Matcher>): ConcatMatcher {
		return new ConcatMatcher(original);
	},
	repeat(min: number, max: number, matcher: Matcher): RepeatMatcher {
		return new RepeatMatcher(min, max, matcher);
	},
	max(max: number, matcher: Matcher): RepeatMatcher {
		return new RepeatMatcher(0, max, matcher);
	},
	min(min: number, matcher: Matcher): RepeatMatcher {
		return new RepeatMatcher(min, Infinity, matcher);
	},
	or(original: Iterable<Matcher>): OrMatcher {
		return new OrMatcher(original);
	},
	star(matcher: Matcher): RepeatMatcher {
		return new RepeatMatcher(0, Infinity, matcher);
	}
};

let w = ns.star(ns.char(" \t\r\n\f"));

test("?", "", w);
test("y", " ", w);
test("y", "\t", w);
test("y", "\r", w);
test("y", "\n", w);
test("y", "\f", w);
