type MatchState = "y" | "n" | "?";

interface Matcher {
	matches(): MatchState;
	reset(): void;
	update(char: string): void;
}

class CharMatcher implements Matcher {
	private ranges: Array<[string, string]>;
	private negated: boolean;
	private state: MatchState;

	constructor(string: string) {
		this.negated = false;
		this.ranges = new Array<[string, string]>();
		if (string[0] === "^") {
			this.negated = true;
			string = string.slice(1);
		}
		let re = /(([^-]-[^-])|(.))/g;
		let parts: RegExpExecArray | null = null;
		while ((parts = re.exec(string)) != null) {
			let string = parts[1];
			let one = string[0];
			let two = (string.length === 3 ? string[2] : one);
			let min = (one < two ? one : two);
			let max = (one > two ? one : two);
			this.ranges.push([min, max]);
		}
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
				for (let range of this.ranges) {
					if ((char >= range[0]) && (char <= range[1])) {
						this.state = (this.negated ? "n" : "y");
						return;
					}
				}
				this.state = (this.negated ? "y" : "n");
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
	private original: Array<Matcher>;
	private matchers: Array<Matcher>;

	constructor(...matchers: Array<Matcher>) {
		this.original = matchers;
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
	private original: Array<Matcher>;
	private matchers: Array<Matcher>;
	private accepted: number;
	private state: MatchState;

	constructor(...matchers: Array<Matcher>) {
		this.original = matchers;
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
	char(string: string): Matcher {
		return new CharMatcher(string);
	},
	word(string: string): Matcher {
		return new WordMatcher(string);
	},
	concat(...matchers: Array<Matcher>): Matcher {
		return new ConcatMatcher(...matchers);
	},
	repeat(min: number, max: number, matcher: Matcher): Matcher {
		return new RepeatMatcher(min, max, matcher);
	},
	or(...matchers: Array<Matcher>): Matcher {
		return new OrMatcher(...matchers);
	},
	star(matcher: Matcher): Matcher {
		return new RepeatMatcher(0, Infinity, matcher);
	},
	max(max: number, matcher: Matcher): Matcher {
		return new RepeatMatcher(0, max, matcher);
	},
	min(min: number, matcher: Matcher): Matcher {
		return new RepeatMatcher(min, Infinity, matcher);
	},
	plus(matcher: Matcher): Matcher {
		return new RepeatMatcher(1, Infinity, matcher);
	},
	opt(matcher: Matcher): Matcher {
		return new RepeatMatcher(0, 1, matcher);
	}
};








function test(expected: MatchState, string: string, matcher: Matcher): void {
	for (let char of string) {
		matcher.update(char);
	}
	let state = matcher.matches();
	if (state !== expected) {
		throw {
			state,
			expected,
			string,
			matcher
		};
	}
}

let mname = () => ns.or(
	ns.plus(mnmchar())
);

let mnmstart = () => ns.or(
	ns.char("_a-z"),
	mnonascii(),
	mescape()
);

let mnonascii = () => ns.char("^\u0000-\u007F");

let municode = () => ns.concat(
	ns.word("\\"),
	ns.repeat(1, 6, ns.char("0-9a-f")),
	ns.opt(ns.or(
		ns.word("\r\n"),
		ns.char(" \n\r\t\f")
	))
);

let mescape = () => ns.concat(
	municode(),
	ns.concat(
		ns.word("\\"),
		ns.char("^\n\r\f0-9a-f")
	)
);

let mnmchar = () => ns.or(
	ns.char("_a-z0-9-"),
	mnonascii(),
	mescape()
);

let mnum = () => ns.or(
	ns.plus(ns.char("0-9")),
	ns.concat(
		ns.star(ns.char("0-9")),
		ns.word("."),
		ns.plus(ns.char("0-9"))
	)
);

let mnl = () => ns.or(
	ns.word("\n"),
	ns.word("\r\n"),
	ns.word("\r"),
	ns.word("\f")
);

let mw = () => ns.star(ns.char(" \t\r\n\f"));
