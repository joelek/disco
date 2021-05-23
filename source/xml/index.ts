import * as is from "../is";

const DEBUG = false;

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
	"IDENTIFIER": /^([a-z][a-z0-9_-]*)/isu,
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
		throw `Unexpected ${token.type} at row ${token.row}, col ${token.col}!`;
	}
	return token;
};

export type XMLName = {
	name: string,
	namespace?: string
};

function parseName(tokenizer: Tokenizer): XMLName {
	return tokenizer.newContext((read, peek) => {
		let prefix = expect(read(), "IDENTIFIER").value;
		let suffix = tokenizer.newOptional((read, peek) => {
			expect(read(), ":");
			return expect(read(), "IDENTIFIER").value;
		});
		if (is.absent(suffix)) {
			let name = prefix;
			return {
				name: name
			};
		} else {
			let name = suffix;
			let namespace = prefix;
			return {
				name,
				namespace
			};
		}
	});
}

export abstract class XMLNode {
	asElement(): XMLElement {
		throw `Expected node to be an XMLElement!`;
	}

	isElement(): boolean {
		try {
			this.asElement();
			return true;
		} catch (error) {}
		return false;
	}

	asText(): XMLText {
		throw `Expected node to be an XMLText!`;
	}

	isText(): boolean {
		try {
			this.asText();
			return true;
		} catch (error) {}
		return false;
	}
};

function parseNode(tokenizer: Tokenizer, indent: string = ""): XMLNode {
	try {
		return parseElement(tokenizer, indent);
	} catch (error) {}
	try {
		return parseText(tokenizer);
	} catch (error) {}
	return tokenizer.newContext((read, peek) => {
		let token = peek();
		if (is.present(token)) {
			throw `Unexpected ${token.type} at ${token.row}, ${token.col}!`;
		} else {
			throw `Unexpectedly reached end of stream!`;
		}
	});
}

export class XMLText extends XMLNode {
	private $value: string;

	constructor(value: string) {
		super();
		this.$value = value;
	}

	asText(): XMLText {
		return this;
	}

	value(): string {
		return this.$value;
	}
};

function parseText(tokenizer: Tokenizer): XMLText {
	return tokenizer.newContext((read, peek) => {
		let value = expect(read(), ["TEXT_NODE", "IDENTIFIER"]).value;
		return new XMLText(value);
	});
}

export class XMLAttribute {
	private $key: string;
	private $value: string;

	constructor(key: string, value: string) {
		this.$key = key;
		this.$value = value;
	}

	key(): string {
		return this.$key;
	}

	value(): string {
		return this.$value;
	}
};

function parseAttribute(tokenizer: Tokenizer): XMLAttribute {
	return tokenizer.newContext((read, peek) => {
		let key = parseName(tokenizer);
		let value = "";
		if (peek()?.type === "=") {
			read();
			let token = read();
			if (token.type === "STRING_LITERAL") {
				value = token.value.slice(1, -1);
			} else if (token.type === "BOOLEAN_LITERAL") {
				value = token.value;
			} else if (token.type === "NUMERIC_LITERAL") {
				value = token.value;
			}
		}
		return new XMLAttribute(
			key.name,
			value
		);
	});
}

class XMLArray<A> {
	private array: Array<A>;

	constructor(iterable: Iterable<A>) {
		this.array = Array.from(iterable);
	}

	get(index: number): A {
		if (index < 0 || index >= this.array.length) {
			throw `Expected index ${index} to be between 0 and ${this.array.length}!`;
		}
		return this.array[index];
	}

	length(): number {
		return this.array.length;
	}

	[Symbol.iterator](): Iterator<A> {
		return this.array[Symbol.iterator]();
	}
};

export class XMLElement extends XMLNode {
	private $tag: string;
	private $attributes: XMLArray<XMLAttribute>;
	private $children: XMLArray<XMLNode>;

	constructor(tag: string, attributes: Iterable<XMLAttribute>, children: Iterable<XMLNode>) {
		super();
		this.$tag = tag;
		this.$attributes = new XMLArray(attributes);
		this.$children = new XMLArray(children);
	}

	asElement() {
		return this;
	}

	tag(...expected: Array<string>): string {
		let tag = this.$tag;
		if (expected.length > 0 && !expected.includes(tag)) {
			throw `Expected tag to be one of [${expected.join(", ")}] but was ${tag}!`;
		}
		return tag;
	}

	attributes(): XMLArray<XMLAttribute> {
		return this.$attributes;
	}

	children(): XMLArray<XMLNode> {
		return this.$children;
	}
};

const VOID_ELEMENTS = [ "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr" ];
const OMITTABLE_ELEMENTS = [ "li" ];

function parseElement(tokenizer: Tokenizer, indent: string = ""): XMLElement {
	return tokenizer.newContext((read, peek) => {
		if (peek()?.type === "SCRIPT_NODE") {
			read();
			return new XMLElement("script", [], []);
		}
		if (peek()?.type === "STYLE_NODE") {
			read();
			return new XMLElement("style", [], []);
		}
		expect(read(), "<");
		let tag = parseName(tokenizer);
		let attributes = new Array<XMLAttribute>();
		while (peek()?.type !== ">" && peek()?.type !== "/>") {
			let attribute = parseAttribute(tokenizer);
			attributes.push(attribute);
		}
		let children = new Array<XMLNode>();
		let token = expect(read(), [">", "/>"]);
		if (DEBUG) {
			console.log(`${indent}<${tag.name}>`);
		}
		if (token.type === ">" && !VOID_ELEMENTS.includes(tag.name)) {
			while (peek()?.type !== "</") {
				while (peek()?.type === "COMMENT") {
					read();
				}
				let child = parseNode(tokenizer, indent + "\t");
				children.push(child);
				while (peek()?.type === "COMMENT") {
					read();
				}
			}
			let tag_close = tokenizer.newOptional((read, peek) => {
				expect(read(), "</");
				let tag_close = parseName(tokenizer);
				if (tag_close.name !== tag.name) { throw `` };
				if (tag_close.namespace !== tag.namespace) { throw `` };
				expect(read(), ">");
				return tag_close;
			});
			if (is.absent(tag_close) && !OMITTABLE_ELEMENTS.includes(tag.name)) {
				throw `Expected a closing tag!`;
			}
		}
		if (DEBUG) {
			console.log(`${indent}</${tag.name}>`);
		}
		return new XMLElement(tag.name, attributes, children);
	});
}

export type XMLDocument = {
	root: XMLElement
};

function parseHeader(tokenizer: Tokenizer): void {
	try {
		return tokenizer.newContext((read, peek) => {
			expect(read(), "<");
			expect(read(), "?");
			if (expect(read(), "IDENTIFIER").value !== "xml") { throw ``; }
			if (expect(read(), "IDENTIFIER").value !== "version") { throw ``; }
			expect(read(), "=");
			expect(read(), "STRING_LITERAL");
			if (expect(read(), "IDENTIFIER").value !== "encoding") { throw ``; }
			expect(read(), "=");
			expect(read(), "STRING_LITERAL");
			expect(read(), "?");
			expect(read(), ">");
		});
	} catch (error) {}
}

function parseDoctype(tokenizer: Tokenizer): void {
	return tokenizer.newContext((read, peek) => {
		expect(read(), "<");
		expect(read(), "!");
		if (expect(read(), "IDENTIFIER").value !== "DOCTYPE") { throw ``; }
		let name = expect(read(), "IDENTIFIER").value;
		tokenizer.newOptional((read, peek) => {
			let access = expect(read(), "IDENTIFIER").value;
			let type = expect(read(), "STRING_LITERAL").value;
			let url = expect(read(), "STRING_LITERAL").value;
		});
		expect(read(), ">");
	});
}

function parseDocument(tokenizer: Tokenizer): XMLDocument {
	return tokenizer.newContext((read, peek) => {
		let header = parseHeader(tokenizer);
		let doctype = parseDoctype(tokenizer);
		let root = parseElement(tokenizer);
		return {
			root
		};
	});
}

export function parse(string: string): XMLDocument {
	let tokenizer = new Tokenizer(string.trim());
	return parseDocument(tokenizer);
};
