import * as is from "../is";

const MATCHERS = {
	"WS": /^([\t\r\n ]+)/isu,
	"<": /^([<])/isu,
	">": /^([>])/isu,
	"!": /^([!])/isu,
	"?": /^([?])/isu,
	"=": /^([=])/isu,
	":": /^([:])/isu,
	"</": /^([<][/])/isu,
	"/>": /^([/][>])/isu,
	"TEXT_NODE": /^([^<>]+)[<]/isu,
	"IDENTIFIER": /^([a-z_][a-z0-9_-]*)/isu,
	"STRING_LITERAL": /^("[^"<]*"|'[^'<]*')/isu,
	"NUMERIC_LITERAL": /^([0-9]+)/isu,
	"BOOLEAN_LITERAL": /^(true|false)/isu,
	"COMMENT": /^([<]\s*[!]\s*[-]\s*[-].*?([-]\s*[-]\s*[>]))/isu,
	"SCRIPT_NODE": /^([<]script[^>]*[>].*?([<][/]script[>]))/isu,
	"STYLE_NODE": /^([<]style[^>]*[>].*?([<][/]style[>]))/isu
};

export type Type = keyof typeof MATCHERS;

export type Token = {
	row: number,
	col: number,
	type: Type,
	value: string
};

export class Tokenizer {
	private tokens: Array<Token>;
	private offset: number;

	private peek(): Token | undefined {
		return this.tokens[this.offset];
	}

	private read(): Token {
		if (this.offset >= this.tokens.length) {
			throw `Unexpectedly reached end of stream!`;
		}
		return this.tokens[this.offset++];
	}

	constructor(string: string) {
		let tokens = new Array<Token>();
		let row = 1;
		let col = 1;
		while (string.length > 0) {
			let token: [Type, string] | undefined;
			for (let key in MATCHERS) {
				let type = key as Type;
				let exec = MATCHERS[type].exec(string);
				if (is.absent(exec)) {
					continue;
				}
				if (is.absent(token) || (exec[1].length > token[1].length)) {
					token = [type, exec[1]];
				}
			}
			if (is.absent(token)) {
				throw `Unrecognized token at row ${row}, col ${col}!` + string.slice(0, 100);
			}
			tokens.push({
				type: token[0],
				value: token[1],
				row: row,
				col: col
			});
			string = string.slice(token[1].length);
			let lines = token[1].split(/\r?\n/);
			if (lines.length > 1) {
				row += lines.length - 1;
				col = 1;
			}
			col += lines[lines.length - 1].length;
		}
		this.tokens = tokens.filter((token) => {
			return token.type !== "WS";
		});
		this.offset = 0;
	}

	newOptional<A>(producer: (read: () => Token, peek: () => Token | undefined) => A): A | undefined {
		let offset = this.offset;
		try {
			return producer(() => this.read(), () => this.peek());
		} catch (error) {
			this.offset = offset;
		}
		return undefined;
	}

	newContext<A>(producer: (read: () => Token, peek: () => Token | undefined) => A): A {
		let offset = this.offset;
		try {
			return producer(() => this.read(), () => this.peek());
		} catch (error) {
			this.offset = offset;
			throw error;
		}
	}
};

export function expect(token: Token, family: Type | Type[]): Token {
	let families = Array.isArray(family) ? family : [family];
	if (!families.includes(token.type)) {
		throw `Unexpected ${token.type} at row ${token.row}, col ${token.col}, expected ${families}!`;
	}
	return token;
};
