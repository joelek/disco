let req = (body, cb) => {
	let xhr = new XMLHttpRequest();
	xhr.addEventListener("readystatechange", () => {
		if (xhr.readyState === XMLHttpRequest.DONE) {
			cb(JSON.parse(xhr.responseText));
		}
	});
	xhr.open("POST", "/events", true);
	xhr.send(JSON.stringify(body));
};
let input = document.createElement("input");
input.setAttribute("type", "text");
let button = document.createElement("input");
button.setAttribute("type", "button");
button.addEventListener("click", () => {
	req({
		type: "get_disc_id"
	}, (response) => {
		input.value = response.disc_id;
	})
});
document.body.appendChild(input);
document.body.appendChild(button);
