import * as fs from "fs";
import * as xml from "./xml";

type Data = [string, [string, string][], Data[]];

function extractData(xml: xml.XMLElement): Data {
	let tag = xml.tag.name;
	let attributes = xml.attributes
		.filter((attribute) => !["id", "class", "style"].includes(attribute.key.name))
		.map((attribute) => [attribute.key.name, attribute.value.replace(/[\r\n\t]+/g, "")] as [string, string]);
	let children = xml.children
		.filter((child): child is xml.XMLElement => child.isElement())
		.map((element) => extractData(element));
	return [tag, attributes, children];
};

function pathify(string: string): string {
	return string
		.normalize("NFKD")
		.replace(/[\|\/\\\_\-]/g, " ")
		.replace(/[^A-Za-z0-9 ]/g, "")
		.trim()
		.split(/(?=[A-Z])|[ ]+/g)
		.join("-")
		.toLowerCase();
};

// Parser does not support directives like doctype.
let source = fs.readFileSync("./private/icons.svg", "utf-8");
let document = xml.parse(source);
let root = document.nodes.find((node) => node.isElement() && node.asElement().tag.name === "svg") as xml.XMLElement | undefined;
let factory: { [key: string]: Data } = {};
if (root != null) {
	for (let node of root.children) {
		if (!node.isElement()) {
			continue;
		}
		let tag = node.tag;
		if (tag.name !== "g") {
			continue;
		}
		let id = node.attributes.find((attribute) => attribute.key.name === "id");
		if (id == null) {
			continue;
		}
		let key = pathify(id.value);
		factory[key] = extractData(node);
	}
}
for (let key of Object.keys(factory).sort()) {
	console.log(`\t["${key}"]: ${JSON.stringify(factory[key])},`);
}
