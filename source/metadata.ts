import * as libhttp from "http";
import * as libhttps from "https";
import * as libfs from "fs";
import * as libpath from "path";
import { Reader } from "./reader";
import * as xml from "./xml";
import * as is from "./is";

class XMLAttribute {
	readonly document: XMLDocument | null;
	readonly key: string;
	readonly value: string;

	constructor(document: XMLDocument | null, key: string, value: string) {
		this.document = document;
		this.key = key;
		this.value = value;
	}

	toString(): string {
		let string = "";
		// TODO: Adhere to specification.
		string += this.key;
		string += "=";
		string += "\"";
		// TODO: Adhere to specification.
		string += this.value;
		string += "\"";
		return string;
	}

	static readKey(reader: Reader): string {
		let string = reader.read(1);
		// TODO: Adhere to specification.
		if (!/^[a-zA-Z_]$/.test(string)) {
			throw "";
		}
		while (true) {
			// TODO: Adhere to specification.
			if (!/^[a-zA-Z_0-9-.:]$/.test(reader.peek(1))) {
				break;
			}
			string += reader.read(1);
		}
		return string;
	}

	static readSingleQuotedValue(reader: Reader): string {
		readWord(reader, "'");
		let value = "";
		while (true) {
			let next = reader.peek(1);
			// TODO: Adhere to specification.
			if (next === "'") {
				break;
			} else {
				value += reader.read(1);
			}
		}
		readWord(reader, "'");
		return value;
	}

	static readDoubleQuotedValue(reader: Reader): string {
		readWord(reader, "\"");
		let value = "";
		while (true) {
			let next = reader.peek(1);
			// TODO: Adhere to specification.
			if (next === "\"") {
				break;
			} else {
				value += reader.read(1);
			}
		}
		readWord(reader, "\"");
		return value;
	}

	static readQuotedValue(reader: Reader): string {
		let offset = reader.tell();
		try {
			return XMLAttribute.readDoubleQuotedValue(reader);
		} catch (error) {
			reader.seek(offset);
		}
		try {
			return XMLAttribute.readSingleQuotedValue(reader);
		} catch (error) {
			reader.seek(offset);
		}
		throw "";
	}

	static readUnquotedValue(reader: Reader): string {
		let value = "";
		while (true) {
			let next = reader.peek(1);
			if ((next === " ") || (next === "\t") || (next === "\r") || (next === "\n") || (next === "\f")) {
				break;
			} else if ((next === "/") || (next === ">")) {
				break;
			} else {
				value += reader.read(1);
			}
		}
		return value;
	}

	static readValue(reader: Reader): string {
		let offset = reader.tell();
		try {
			return XMLAttribute.readQuotedValue(reader);
		} catch (error) {
			reader.seek(offset);
		}
		try {
			return XMLAttribute.readUnquotedValue(reader);
		} catch (error) {
			reader.seek(offset);
		}
		throw "";
	}

	static new(document: XMLDocument | null, reader: Reader): XMLAttribute {
		let key = XMLAttribute.readKey(reader);
		let value = "";
		// TODO: Adhere to specification.
		if (reader.peek(1) === "=") {
			reader.read(1);
			value = XMLAttribute.readValue(reader);
		}
		return new XMLAttribute(
			document,
			key,
			value
		);
	}
}

interface Visitor<A> {
	(visitable: Visitable<A>): void;
}

interface Visitable<A> {
	visit(visitor: Visitor<A>): void
}

class XMLNode implements Visitable<XMLNode> {
	private document: XMLDocument | null;
	private parent: XMLElementNode | null;

	constructor() {
		this.parent = null;
	}

	getDocument(): XMLDocument | null {
		return this.document;
	}

	setDocument(document: XMLDocument | null): void {
		this.document = document;
	}

	getText(): string {
		throw "";
	}

	getTrimmedText(): string {
		return this.getText().trim();
	}

	getParent(): XMLElementNode | null {
		return this.parent;
	}

	setParent(parent: XMLElementNode | null): void {
		this.parent = parent; // CHECK RECURSION
	}

	asElement(): XMLElementNode {
		throw "";
	}

	isElement(): this is XMLElementNode {
		return false;
	}

	asText(): XMLTextNode {
		throw "";
	}

	isText(): this is XMLTextNode {
		return false;
	}

	visit(visitor: Visitor<XMLNode>): void {
		throw "";
	}
}

class XMLTextNode extends XMLNode {
	readonly string: string;

	constructor(string: string) {
		super();
		this.string = string;
	}

	getText(): string {
		return this.string.replace("&nbsp;", " ").replace("&quot;", "\"").replace("&lt;", "<").replace("&gt;", ">");
	}

	toString(): string {
		return this.string;
	}

	asText(): XMLTextNode {
		return this;
	}

	isText(): boolean {
		return true;
	}

	visit(visitor: Visitor<XMLNode>): void {

	}
}

class XMLElementNode extends XMLNode {
	readonly tag: string;
	readonly attributes: Iterable<XMLAttribute>;
	readonly children: Iterable<XMLNode>;

	constructor(tag: string, attributes: Iterable<XMLAttribute>, children: Iterable<XMLNode>) {
		super();
		this.tag = tag;
		this.attributes = attributes;
		this.children = children;
		for (let child of children) {
			child.setParent(this);
		}
	}

	getText(): string {
		let strings = new Array<string>();
		for (let child of this.children) {
			strings.push(child.getText());
		}
		return strings.join("");
	}

	asElement(): XMLElementNode {
		return this;
	}

	getAttribute(key: string): string | null {
		for (let attribute of this.attributes) {
			if (attribute.key === key) {
				return attribute.value;
			}
		}
		return null;
	}

	isElement(): boolean {
		return true;
	}

	toString(): string {
		let string = "";
		string += "<";
		string += this.tag; // TODO: Escape?
		for (let attribute of this.attributes) {
			string += " ";
			string += attribute;
		}
		let content = "";
		for (let child of this.children) {
			content += child;
		}
		// TODO: Support minimized form.
		if (false && content.length === 0) {
			string += "/";
			string += ">";
		} else {
			string += ">";
			string += content;
			string += "<";
			string += "/";
			string += this.tag; // TODO: Escape?
			string += ">";
		}
		return string;
	}

	visit(visitor: Visitor<XMLNode>): void {
		visitor(this);
		for (let child of this.children) {
			child.visit(visitor);
		}
	}

	querySelector(string: string): XMLElementNode | null {
		let elements = Array.from(this.querySelectorAll(string));
		if (elements.length > 0) {
			return elements[0];
		}
		return null;
	}

	querySelectorAll(string: string): Iterable<XMLElementNode> {
		let document = this.getDocument();
		let elements = new Set<XMLElementNode>();
		if (document !== null) {
			let candidateElements = document.querySelectorAll(string);
			for (let candidateElement of candidateElements) {
				for (let parent = candidateElement.getParent(); parent !== null; parent = parent.getParent()) {
					if (parent === this) {
						elements.add(candidateElement);
						break;
					}
				}
			}
		}
		return elements;
	}
}

function computeIntersection<A>(one: Set<A>, two: Iterable<A>): Set<A> {
	let set = new Set<A>();
	for (let value of two) {
		if (one.has(value)) {
			set.add(value);
		}
	}
	return set;
}

function computeUnion<A>(one: Set<A>, two: Iterable<A>): Set<A> {
	let set = new Set<A>(one);
	for (let value of two) {
		set.add(value);
	}
	return set;
}

interface AttributeFilter {
	mode: "=" | "~=" | "|=" | "^=" | "$=" | "*=";
	value: string;
}

interface SimpleSelector {
	type: "id" | "attribute" | "class" | "tagname",
	value: string,
	filter?: AttributeFilter;
}

function parseSimpleSelector(string: string): Array<SimpleSelector> {
	let selectors = new Array<SimpleSelector>();
	let reader = new Reader(string);
	while (!reader.done()) {
		if (reader.peek(1) === "*") {
			reader.read(1);
			continue;
		}
		let offset = reader.tell();
		try {
			readWord(reader, ".");
			let value = "";
			while (!reader.done()) {
				let char = reader.peek(1);
				if (char === "[" || char === "." || char === "#" || char === "*") {
					break;
				}
				value += reader.read(1);
			}
			selectors.push({
				type: "class",
				value
			});
			continue;
		} catch (error) {
			reader.seek(offset);
		}
		try {
			readWord(reader, "#");
			let value = "";
			while (!reader.done()) {
				let char = reader.peek(1);
				if (char === "[" || char === "." || char === "#" || char === "*") {
					break;
				}
				value += reader.read(1);
			}
			selectors.push({
				type: "id",
				value
			});
			continue;
		} catch (error) {
			reader.seek(offset);
		}
		try {
			readWord(reader, "[");
			let value = "";
			while (true) {
				let char = reader.peek(1);
				if (["]", "=", "~", "|", "^", "$", "*"].includes(char)) {
					break;
				}
				value += reader.read(1);
			}
			let filter: AttributeFilter | undefined;
			let char = reader.peek(1);
			if (char !== "]") {
				let mode: AttributeFilter["mode"] = "=";
				if (char === "=") {
					readWord(reader, "=");
				} else if (char === "~") {
					readWord(reader, "~=");
					mode = "~=";
				} else if (char === "|") {
					readWord(reader, "|=");
					mode = "|=";
				} else if (char === "^") {
					readWord(reader, "^=");
					mode = "^=";
				} else if (char === "$") {
					readWord(reader, "$=");
					mode = "$=";
				} else if (char === "*") {
					readWord(reader, "*=");
					mode = "*=";
				}
				let value = "";
				let qmark = "";
				char = reader.peek(1);
				if (char === "\"" || char === "'") {
					qmark = reader.read(1);
				}
				while (true) {
					let char = reader.peek(1);
					// TODO: Add support for escaped quotation marks.
					if (char === "]" || char === qmark) {
						break;
					}
					value += reader.read(1);
				}
				readWord(reader, qmark);
				filter = {
					mode,
					value
				};
			}
			readWord(reader, "]");
			selectors.push({
				type: "attribute",
				value,
				filter
			});
			continue;
		} catch (error) {
			reader.seek(offset);
		}
		let value = "";
		while (!reader.done()) {
			let char = reader.peek(1);
			if (char === "[" || char === "." || char === "#" || char === "*") {
				break;
			}
			value += reader.read(1);
		}
		selectors.push({
			type: "tagname",
			value
		});
	}
	return selectors;
}

class XMLDocument {
	readonly children: Iterable<XMLNode>;
	private elementsInDocument: Set<XMLElementNode>;
	private elementsWithId: Map<string, Set<XMLElementNode>>;
	private elementsWithClassName: Map<string, Set<XMLElementNode>>;
	private elementsWithTagName: Map<string, Set<XMLElementNode>>;
	private elementsWithAttribute: Map<string, Set<XMLElementNode>>;

	private querySelectorAllSimple(string: string): Iterable<XMLElementNode> {
		let selectors = parseSimpleSelector(string);
		let elements = this.elementsInDocument;
		while (elements.size > 0 && selectors.length > 0) {
			let newElements: Iterable<XMLElementNode> = elements;
			let selector = selectors.pop() as SimpleSelector;
			if (selector.type === "id") {
				let element = this.getElementById(selector.value);
				if (element !== null) {
					newElements = [ element ];
				} else {
					newElements = [];
				}
			} else if (selector.type === "class") {
				newElements = this.getElementsByClassName(selector.value);
			} else if (selector.type === "attribute") {
				newElements = this.getElementsByAttribute(selector.value);
				const filter = selector.filter;
				if (is.present(filter)) {
					newElements = Array.from(newElements).filter((element) => {
						let attribute = element.getAttribute(selector.value);
						if (is.present(attribute)) {
							if (filter.mode === "=") {
								return attribute === filter.value;
							}
							if (filter.mode === "~=") {
								return attribute.split(/\s/).includes(filter.value);
							}
							if (filter.mode === "|=") {
								return attribute === filter.value || attribute.startsWith(filter.value + "-");
							}
							if (filter.mode === "^=") {
								return attribute.startsWith(filter.value);
							}
							if (filter.mode === "$=") {
								return attribute.endsWith(filter.value);
							}
							if (filter.mode === "*=") {
								return attribute.includes(filter.value);
							}
						}
						return false;
					});
				}
			} else if (selector.type === "tagname") {
				newElements = this.getElementsByTagName(selector.value);
			}
			elements = computeIntersection(elements, newElements);
		}
		return elements;
	}

	constructor(children: Iterable<XMLNode>) {
		this.children = children;
		this.elementsInDocument = new Set<XMLElementNode>();
		this.elementsWithId = new Map<string, Set<XMLElementNode>>();
		this.elementsWithClassName = new Map<string, Set<XMLElementNode>>();
		this.elementsWithTagName = new Map<string, Set<XMLElementNode>>();
		this.elementsWithAttribute = new Map<string, Set<XMLElementNode>>();
		let visited = new Set<XMLNode>();
		let visitor = (node: XMLNode): void => {
			if (!visited.has(node)) {
				visited.add(node);
				node.setDocument(this);
				if (node.isElement()) {
					let element = node.asElement();
					this.elementsInDocument.add(element);
					for (let attribute of element.attributes) {
						let elements = this.elementsWithAttribute.get(attribute.key);
						if (elements === undefined) {
							elements = new Set<XMLElementNode>();
							this.elementsWithAttribute.set(attribute.key, elements);
						}
						elements.add(element);
					}
					let classValue = element.getAttribute("class");
					if (classValue !== null) {
						let classNames = classValue.trim().split(/\s+/);
						for (let className of classNames) {
							let elements = this.elementsWithClassName.get(className);
							if (elements === undefined) {
								elements = new Set<XMLElementNode>();
								this.elementsWithClassName.set(className, elements);
							}
							elements.add(element);
						}
					}
					let idValue = element.getAttribute("id");
					if (idValue !== null) {
						let elements = this.elementsWithId.get(idValue);
						if (elements === undefined) {
							elements = new Set<XMLElementNode>();
							this.elementsWithId.set(idValue, elements);
						}
						elements.add(element);
					}
					let elements = this.elementsWithTagName.get(element.tag);
					if (elements === undefined) {
						elements = new Set<XMLElementNode>();
						this.elementsWithTagName.set(element.tag, elements);
					}
					elements.add(element);
				}
			}
		};
		for (let child of children) {
			child.visit(visitor);
		}
	}

	getElementsByAttribute(attribute: string): Iterable<XMLElementNode> {
		let elements = this.elementsWithAttribute.get(attribute);
		if (elements !== undefined) {
			return elements;
		}
		return [];
	}

	getElementsByClassName(className: string): Iterable<XMLElementNode> {
		let elements = this.elementsWithClassName.get(className);
		if (elements !== undefined) {
			return elements;
		}
		return [];
	}

	getElementsById(id: string): Iterable<XMLElementNode> {
		let elements = this.elementsWithId.get(id);
		if (elements !== undefined) {
			return elements;
		}
		return [];
	}

	getElementById(id: string): XMLElementNode | null {
		let elements = Array.from(this.getElementsById(id));
		if (elements.length > 0) {
			return elements[0];
		}
		return null;
	}

	getElementsByTagName(tagName: string): Iterable<XMLElementNode> {
		let elements = this.elementsWithTagName.get(tagName);
		if (elements !== undefined) {
			return elements;
		}
		return [];
	}

	querySelectorAll(selector: string): Iterable<XMLElementNode> {
		// GROUPS
		let structuralParts = selector.split(/\s*([>+~ ])\s*/);
		let elements = new Set(this.querySelectorAllSimple(structuralParts.shift() as string));
		while (structuralParts.length >= 2 && elements.size > 0) {
			let combinator = structuralParts.shift() as string;
			let selector = structuralParts.shift() as string;
			let subElements = this.querySelectorAllSimple(selector);
			let newElements = new Set<XMLElementNode>();
			if (combinator === " ") {
				for (let subElement of subElements) {
					for (let parent = subElement.getParent(); parent !== null; parent = parent.getParent()) {
						if (elements.has(parent)) {
							newElements.add(subElement);
							break;
						}
					}
				}
			} else if (combinator === ">") {
				for (let subElement of subElements) {
					let parent = subElement.getParent();
					if (parent != null && elements.has(parent)) {
						newElements.add(subElement);
					}
				}
			} else if (combinator === "+") {
			} else if (combinator === "~") {
			} else {}
			elements = newElements;
		}
		return elements;
	}

	querySelector(selector: string): XMLElementNode | null {
		let elements = Array.from(this.querySelectorAll(selector));
		if (elements.length > 0) {
			return elements[0];
		}
		return null;
	}

	toString(): string {
		let string = "";
		for (let child of this.children) {
			string += child;
		}
		return string;
	}
}



















function readWord(reader: Reader, word: string): void {
	if (reader.peek(word.length) !== word) {
		throw "";
	}
	reader.read(word.length);
}

function readWhitespace(reader: Reader): void {
	while (true) {
		let next = reader.peek(1);
		if (next !== " " && next !== "\t" && next !== "\r" && next !== "\n" && next !== "\f") {
			break;
		}
		reader.read(1);
	}
}

function readTag(reader: Reader): string {
	if (!/^[a-zA-Z_]$/.test(reader.peek(1))) {
		throw "";
	}
	let string = reader.read(1);
	while (true) {
		if (!/^[a-zA-Z_0-9-.:]$/.test(reader.peek(1))) {
			break;
		}
		string += reader.read(1);
	}
	return string;
}

const VOID_ELEMENTS = [ "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "li" ];

function readXMLTextNode(reader: Reader): XMLTextNode {
	let string = "";
	while (!reader.done()) {
		let offset = reader.tell();
		try {
			readXMLElement(reader);
			reader.seek(offset);
			break;
		} catch (error) {
			reader.seek(offset);
		}
		string += reader.read(1);
	}
	return new XMLTextNode(
		string
	);
}

function readXMLElement(reader: Reader): XMLElementNode {
	let so = reader.tell();
	readWord(reader, "<");
	let tag = readTag(reader);
	//console.log("tag candidate " + tag);
	let attributes = new Array<XMLAttribute>();
	let children = new Array<XMLNode>();
	let sterile = (VOID_ELEMENTS.indexOf(tag) >= 0);
	while (true) {
		readWhitespace(reader);
		let next = reader.peek(1);
		if (next === ">") {
			break;
		} else if (next === "/") {
			reader.read(1);
			sterile = true;
			break;
		}
		let attribute = XMLAttribute.new(null/*document*/, reader);
		attributes.push(attribute);
	}
	readWord(reader, ">");
	if (!sterile) {
		let end_tag = "</" + tag + ">";
		let text = "";
		//console.log("waiting for: " + end_tag);
		while (reader.peek(end_tag.length) !== end_tag) {
			//console.log(reader.maxoff);
			let offset = reader.tell();
			try {
				let node = readXMLElement(reader);
				if (text !== "") {
					children.push(new XMLTextNode(text));
					text = "";
				}
				children.push(node);
			} catch (error) {
				reader.seek(offset);
				text += reader.read(1);
			}
		}
		readWord(reader, end_tag);
		if (text !== "") {
			children.push(new XMLTextNode(text));
		}
	}
	let eo = reader.tell();
	//console.log(tag + " [" + so + "," + eo + "]");
	return new XMLElementNode(
		tag,
		attributes,
		children
	);
}

function readXMLNode(reader: Reader): XMLNode {
	let offset = reader.tell();
	try {
		return readXMLElement(reader);
	} catch (error) {
		reader.seek(offset);
	}
	try {
		return readXMLTextNode(reader);
	} catch (error) {
		console.log(error);
		reader.seek(offset);
	}
	//throw new Error();
	console.log("not an element nor a text node" + reader.read(10));
	process.exit(1);
}

function readXMLProlog(reader: Reader): void {
	readWord(reader, "<?xml");
	let version: string | null = null;
	let encoding: string | null = null;
	let standalone: string | null = null;
	while (true) {
		readWhitespace(reader);
		if (reader.peek(1) === "?") {
			break;
		} else {
			let key = XMLAttribute.readKey(reader);
			readWord(reader, "=");
			if (false) {
			} else if (key === "version") {
				version = XMLAttribute.readQuotedValue(reader);
			} else if (key === "encoding") {
				encoding = XMLAttribute.readQuotedValue(reader);
			} else if (key === "standalone") {
				standalone = XMLAttribute.readQuotedValue(reader);
			} else {
				throw "";
			}
		}
	}
	if (version !== "1.0") {
		throw "";
	}
	if (standalone !== null && (standalone !== "yes" && standalone !== "no")) {
		throw "";
	}
	readWord(reader, "?>");
}

function readXMLDoctype(reader: Reader): void {
	readWord(reader, "<!DOCTYPE ");
	let doctype = XMLAttribute.readKey(reader);
	readWord(reader, ">");
}

function readXMLDocument(reader: Reader): XMLDocument {
	let offset = reader.tell();
	try {
		readXMLProlog(reader);
	} catch (error) {
		reader.seek(offset);
	}
	offset = reader.tell();
	try {
		readXMLDoctype(reader);
	} catch (error) {
		reader.seek(offset);
	}
	let children = new Array<XMLNode>();
	while (!reader.done()) {
		let node = readXMLNode(reader);
		children.push(node);
	}
	return new XMLDocument(children);
}













interface Callback<A> {
	(value: A): void
}

let rate_limit_avg_ms = 10000;
let last_request_ms = 0;

function request(url: string, cb: Callback<Buffer>) {
	let filename = encodeURIComponent(url);
	let path = libpath.join("./private/cache/", filename);
	libfs.readFile(path, (error, buffer) => {
		if (error) {
			let delay = last_request_ms + Math.round(rate_limit_avg_ms * (0.5 + Math.random())) - Date.now();
			delay = delay > 0 ? delay : 0;
			setTimeout(() => {
				last_request_ms = Date.now();
				console.log("Requesting: " + url);
				let lib = url.startsWith("http://") ? libhttp : libhttps;
				lib.request(url, {
					method: "GET",
					headers:  {
						"accept-language": "en-US"
					}
				}, (response) => {
					response.setEncoding("binary");
					let chunks = new Array<Buffer>();
					response.on("data", (chunk) => {
						chunks.push(Buffer.from(chunk, "binary"));
					});
					response.on("end", () => {
						let buffer = Buffer.concat(chunks);
						libfs.writeFile(path, buffer, () => {
							cb(buffer);
						});
					});
				}).end();
			}, delay);
		} else {
			cb(buffer);
		}
	});
}

function translate(node: xml.XMLNode): XMLNode {
	if (node.isElement()) {
		let element = node.asElement();
		let tag = element.tag();
		let attributes = new Array<XMLAttribute>();
		for (let attribute of element.attributes()) {
			attributes.push(new XMLAttribute(null, attribute.key(), attribute.value()));
		}
		let children = new Array<XMLNode>();
		for (let child of element.children()) {
			children.push(translate(child));
		}
		return new XMLElementNode(tag, attributes, children);
	}
	if (node.isText()) {
		let text = node.asText();
		return new XMLTextNode(text.value());
	}
	throw ``;
}

function getXML(url: string, cb: Callback<XMLDocument>): void {
	request(url, (buffer) => {
		let string = buffer.toString("utf8");
		let doc = xml.parse(string);
		cb(new XMLDocument([ translate(doc.root) ]));
	});
}

export async function promiseXML(url: string): Promise<XMLDocument> {
	return new Promise((resolve, reject) => {
		getXML(url, (xml) => {
			resolve(xml);
		});
	});
};

function getImageURL(url: string): string {
	let parts = url.split(".");
	if (parts.length >= 2) {
		let extension = parts.pop() as string;
		parts.pop();
		parts.push(extension);
		url = parts.join(".");
	}
	return url;
}

interface SearchResult {
	id: string,
	title: string,
	image_url: string
}

interface SearchResults {
	items: Array<SearchResult>
}

type SearchType = "feature" | "tv_series";

export function getSearchResults(query: string, type: Array<SearchType>, year: number | null, cb: Callback<SearchResults>): void {
	let url = "https://www.imdb.com/search/title/?title=" + encodeURIComponent(query) + "&title_type=" + type.join(",") + (year !== null ? "&year=" + year : "");
	getXML(url, (document) => {
		let items = new Array<SearchResult>();
		for (let element of document.querySelectorAll("img[alt][src][data-tconst]")) {
			let id = element.getAttribute("data-tconst");
			let title = element.getAttribute("alt");
			let src = element.getAttribute("src");
			let image_url = src != null ? getImageURL(src) : null;
			if (id != null && title != null && image_url != null) {
				title = title.normalize("NFC");
				items.push({
					id,
					title,
					image_url
				});
			}
		}
		cb({
			items
		});
	});
}

//getSearchResults("south park", [ "tv_series" ], null, (results) => { console.log(results); });

export type TitleType = "show" | "movie" | "neither";

export type Title = {
	id: string,
	type: TitleType,
	title: string,
	year: number | null,
	description: string,
	image_url: string,
	genres: string[],
	stars: {
		id: string,
		name: string
	}[]
};

export function getTitleSummary(id: string): Promise<string | undefined> {
	return new Promise((resolve, reject) => {
		let url = `https://www.imdb.com/title/${id}/plotsummary`;
		getXML(url, (document) => {
			let element = document.querySelector("#plot-summaries-content p");
			if (is.absent(element)) {
				return reject();
			}
			resolve(element.getTrimmedText());
		});
	});
};

/* getTitleSummary("tt0201265").then(console.log); */

let ttcache: {
	[key: string]: Title | undefined
} = {};

export function getTitle(id: string, cb: Callback<Title | null>): void {
	let cached = ttcache[id];
	if (cached) {
		return cb(cached);
	}
	let url = "https://www.imdb.com/title/" + id + "/";
	getXML(url, async (document) => {
		let type: TitleType = "movie";
		let title: string | null = null;
		let year: number | null = null;
		let description: string | null = null;
		let image_url: string | null = null;
		let element: XMLElementNode | null = null;
		element = document.querySelector(`[data-testid="hero-subnav-bar-series-episode-guide-link"]`);
		if (element !== null) {
			type = "show";
		}
		element = document.querySelector(`[data-testid="hero-title-block__metadata"] a[href]`);
		if (element !== null) {
			year = Number.parseInt(element.getTrimmedText());
		}
		element = document.querySelector(`[data-testid="hero-media__poster"] img[src]`);
		if (element !== null) {
			let src = element.getAttribute("src");
			if (src != null) {
				image_url = getImageURL(src);
			}
		}
		description = await getTitleSummary(id) ?? null;
		element = document.querySelector(`[data-testid="hero-title-block__title"]`);
		if (element !== null) {
			title = element.getTrimmedText().normalize("NFC");
		}
		let genres = new Array<string>();
		let elements = document.querySelectorAll(`[data-testid="genres"] a[href]`);
		for (let element of elements) {
			genres.push(element.getTrimmedText().normalize("NFC"));
		}
		let stars = new Array<{ id: string, name: string }>();
		elements = document.querySelectorAll(`[data-testid="title-cast-item__actor"][href]`);
		for (let element of elements) {
			let href = element.getAttribute("href");
			if (href != null) {
				let parts = /^[/]name[/](nm[0-9]+)/.exec(href);
				if (parts != null) {
					let id = parts[1];
					let name = element.getTrimmedText().normalize("NFC");
					stars.push({
						id,
						name
					});
				}
			}
		}
		console.log({title, description, image_url});
		if (title !== null && description !== null && image_url !== null) {
			title = title.normalize("NFC");
			description = description.normalize("NFC");
			let titleobj: Title = {
				id,
				type,
				title,
				year,
				description,
				image_url,
				genres,
				stars: stars.slice(0, 3)
			};
			ttcache[id] = titleobj;
			cb(titleobj);
		} else {
			cb(null);
		}
	});
}

/* getTitle("tt0201265", (results) => { console.log(results); }); */

export interface Credit {
	id: string,
	title: string,
	image_url: string
}

export interface Credits {
	items: Array<Credit>
}

export function getCredits(id: string, cb: Callback<Credits>): void {
	let url = "https://www.imdb.com/title/" + id + "/fullcredits";
	getXML(url, (document) => {
		let items = new Array<Credit>();
		let elements = document.querySelectorAll(".cast_list .primary_photo img[alt][loadlate]");
		for (let element of elements) {
			let id: string | null = null;
			let title = element.getAttribute("alt");
			let image_url: string | null = null;
			let parent = element.getParent();
			if (parent != null) {
				let href = parent.getAttribute("href");
				if (href != null) {
					let parts = /^\/name\/([^\/]+)\//.exec(href);
					if (parts != null) {
			 			id = parts[1];
					}
				}
			}
			let loadlate = element.getAttribute("loadlate");
			if (loadlate != null) {
				image_url = getImageURL(loadlate);
			}
			if (id != null && title != null && image_url != null) {
				title = title.normalize("NFC");
				items.push({
					id,
					title,
					image_url
				});
			}
		}
		cb({
			items
		});
	});
}

// getCredits("tt0121955", (results) => { console.log(results); });

export interface Episode {
	id: string,
	title: string,
	description: string,
	episode_number: number,
	air_date_timestamp: number
}

export interface Season {
	image_url?: string,
	season_number: number,
	episodes: Array<Episode>
}

let sscache: {
	[key: string]: Season | undefined
} = {};

export function getSeason(id: string, season: number, cb: Callback<Season | null>): void {
	let cached = sscache[id + ":" + season];
	if (cached) {
		return cb(cached);
	}
	let url = "https://www.imdb.com/title/" + id + "/episodes?season=" + season;
	getXML(url, (document) => {
		let image_url: string | undefined = undefined;
		let element: XMLElementNode | null;
		let season_number = null as number | null;
		element = document.querySelector("img.poster[src]");
		if (element !== null) {
			let src = element.getAttribute("src");
			if (src != null) {
				image_url = getImageURL(src);
			}
		}
		element = document.querySelector("#episode_top");
		if (element != null) {
			let text = element.getTrimmedText();
			let parts = /^Season\s+([0-9]+)$/.exec(text);
			if (parts != null) {
				season_number = Number.parseInt(parts[1]);
			}
		}
		if (season_number !== season) {
			return cb(null);
		}
		let containers = document.querySelectorAll(".eplist .list_item");
		let episodes = new Array<Episode>();
		for (let container of containers) {
			let element: XMLElementNode | null = null;
			let id: string | null = null;
			element = container.querySelector("[data-const]");
			if (element !== null) {
				id = element.getAttribute("data-const");
			}
			let title: string | null = null;
			element = container.querySelector("[title][itemprop]");
			if (element !== null) {
				title = element.getAttribute("title");
			}
			let description: string | null = null;
			element = container.querySelector(".item_description[itemprop]");
			if (element !== null) {
				description = element.getTrimmedText();
			}
			let episode_number: number | null = null;
			element = container.querySelector("meta[itemprop][content]");
			if (element !== null) {
				let content = element.getAttribute("content");
				if (content != null) {
					episode_number = Number.parseInt(content);
				}
			}
			let air_date_timestamp: number | null = null;
			element = container.querySelector(".airdate");
			if (element !== null) {
				air_date_timestamp = Date.parse(element.getTrimmedText() + "Z");
			}
			if (id != null && title != null && description != null && episode_number != null && air_date_timestamp != null) {
				title = title.normalize("NFC");
				description = description.normalize("NFC");
				episodes.push({
					id,
					title,
					description,
					episode_number,
					air_date_timestamp
				});
			}
		}
		let obj = {
			image_url,
			season_number,
			episodes
		};
		sscache[id + ":" + season] = obj;
		cb(obj);
	});
}

//getSeason("tt0121955", 1, (results) => { console.log(results); });
