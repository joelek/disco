import * as discdb from "./discdb";
import * as utils from "./utils";
import * as imdb from "./imdb";

let db = utils.loadDatabase("./private/db/discdb.json", discdb.MediaDatabase.as);

utils.foreach(Object.values(db), (media, next) => {
	if (media != null) {
		utils.foreach(media.content, async (content, next) => {
			if (discdb.EpisodeContent.is(content)) {
				await imdb.handler.getShow(content.imdb_show);
			} else if (discdb.MovieContent.is(content)) {
				await imdb.handler.getMovie(content.imdb);
			}
			next();
		}, next);
	} else {
		next();
	}
}, () => {});
