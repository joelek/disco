import * as is from "../is";
import { expect, Tokenizer } from "./tokenizer";

const DEBUG = true;

export class XMLName {
	namespace?: string;
	name: string;

	constructor(namespace: string | undefined, name: string) {
		this.namespace = namespace;
		this.name = name;
	}

	equals(that: XMLName): boolean {
		return this.namespace === that.namespace && this.name === that.name;
	}

	static parse(tokenizer: Tokenizer): XMLName {
		return tokenizer.newContext((read, peek) => {
			let prefix = expect(read(), "IDENTIFIER").value;
			let suffix = tokenizer.newOptional((read, peek) => {
				expect(read(), ":");
				return expect(read(), "IDENTIFIER").value;
			});
			if (is.absent(suffix)) {
				let namespace = undefined;
				let name = prefix;
				return new XMLName(
					namespace,
					name
				);
			} else {
				let namespace = prefix;
				let name = suffix;
				return new XMLName(
					namespace,
					name
				);
			}
		});
	}
};

export abstract class XMLNode {
	constructor() {

	}

	asElement(): XMLElement {
		throw `Expected an XMLElement!`;
	}

	isElement(): boolean {
		try {
			this.asElement();
			return true;
		} catch (error) {}
		return false;
	}

	asText(): XMLText {
		throw `Expected an XMLText!`;
	}

	isText(): boolean {
		try {
			this.asText();
			return true;
		} catch (error) {}
		return false;
	}

	static parse(tokenizer: Tokenizer): XMLNode {
		try {
			return XMLElement.parse(tokenizer);
		} catch (error) {}
		try {
			return XMLText.parse(tokenizer);
		} catch (error) {}
		throw ``;
	}
};

export class XMLText extends XMLNode {
	value: string;

	constructor(value: string) {
		super();
		this.value = value;
	}

	asText(): XMLText {
		return this;
	}

	static parse(tokenizer: Tokenizer): XMLText {
		return tokenizer.newContext((read, peek) => {
			let value = expect(read(), ["TEXT_NODE", "IDENTIFIER"]).value;
			return new XMLText(value);
		});
	}
};

export class XMLAttribute {
	key: XMLName;
	value: string;

	constructor(key: XMLName, value: string) {
		this.key = key;
		this.value = value;
	}

	static  parse(tokenizer: Tokenizer): XMLAttribute {
		return tokenizer.newContext((read, peek) => {
			let key = XMLName.parse(tokenizer);
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
			return {
				key,
				value
			};
		});
	}
};


export class XMLElement extends XMLNode {
	tag: XMLName;
	attributes: Array<XMLAttribute>;
	children: Array<XMLNode>;

	constructor(tag: XMLName, attributes?: Array<XMLAttribute>, children?: Array<XMLNode>) {
		super();
		this.tag = tag;
		this.attributes = attributes ?? [];
		this.children = children ?? [];
	}

	asElement() {
		return this;
	}
};

const VOID_ELEMENTS = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
const RAW_TEXT_ELEMENTS = ["script", "style"];
const IMPLICIT_SIBLING_ELEMENTS = ["li"];

function parseNodes(tokenizer: Tokenizer): Array<XMLNode> {
	return tokenizer.newContext((read, peek) => {
		let root = new XMLElement(new XMLName(undefined, ""));
		let open = new Array<XMLElement>();
		function getParent(): XMLElement {
			return open[open.length - 1] ?? root;
		}
		function openTag(tag: XMLName, attributes: Array<XMLAttribute>): void {
			let element = new XMLElement(tag, attributes);
			open.push(element);
		}
		function closeTag(tag: XMLName): void {
			let index: number | undefined;
			for (let i = open.length - 1; i >= 0; i--) {
				if (open[i].tag.equals(tag)) {
					index = i;
					break;
				}
			}
			if (is.present(index)) {
				for (let i = open.length - 1; i >= index; i--) {
					let child = open.pop() as XMLElement;
					let parent = getParent();
					parent.children.push(child);
				}
			} else {
				// TODO: Improve heuristics.
				let parent = getParent();
				parent.children.push(new XMLElement(tag));
			}
		}
		while (is.present(peek())) {
			let parent = getParent();
			let token = read();
			if (token.type === "SCRIPT_NODE") {
				let tag = new XMLName(undefined, "script");
				openTag(tag, []);
				closeTag(tag);
				continue;
			}
			if (token.type === "STYLE_NODE") {
				let tag = new XMLName(undefined, "style");
				openTag(tag, []);
				closeTag(tag);
				continue;
			}
			if (token.type === "<") {
				let tag = XMLName.parse(tokenizer);
				let attributes = new Array<XMLAttribute>();
				while (peek()?.type !== ">" && peek()?.type !== "/>") {
					let attribute = XMLAttribute.parse(tokenizer);
					attributes.push(attribute);
				}
				token = expect(read(), [">", "/>"]);
				if (IMPLICIT_SIBLING_ELEMENTS.includes(tag.name)) {
					let parent = getParent();
					if (is.present(parent) && parent.tag.equals(tag)) {
						closeTag(parent.tag);
					}
				}
				openTag(tag, attributes);
				if (token.type === "/>" || VOID_ELEMENTS.includes(tag.name)) {
					closeTag(tag);
				}
			} else if (token.type === "</") {
				let tag = XMLName.parse(tokenizer);
				token = expect(read(), [">"]);
				closeTag(tag);
			} else {
				parent.children.push(new XMLText(token.value));
			}
		}
		for (let i = open.length - 1; i >= 0; i--) {
			let child = open.pop() as XMLElement;
			let parent = getParent();
			parent.children.push(child);
		}
		return root.children;
	});
}

export type XMLDocument = {
	nodes: Array<XMLNode>;
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
	try {
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
	} catch (error) {}
}

function parseDocument(tokenizer: Tokenizer): XMLDocument {
	return tokenizer.newContext((read, peek) => {
		let header = parseHeader(tokenizer);
		let doctype = parseDoctype(tokenizer);
		let nodes = parseNodes(tokenizer);
		return {
			nodes
		};
	});
}

export function parse(string: string): XMLDocument {
	let start = Date.now();
	let tokenizer = new Tokenizer(string.trim());
	let document = parseDocument(tokenizer);
	let duration = Date.now() - start;
	if (DEBUG) console.log(`XML parsing took ${duration} ms`);
	return document;
};
