import * as libfs from "fs";
import * as discdb from "./discdb";
import * as utils from "./utils";
import * as metadata from "./metadata";

let db = utils.loadDatabase("./private/db/discdb.json", discdb.MediaDatabase.as);

utils.foreach(Object.values(db), (media, next) => {
	if (media != null) {
		utils.foreach(media.content, (content, next) => {
			if (discdb.EpisodeContent.is(content)) {
				metadata.getSeason(content.imdb_show, content.season, (title) => {
					let episode = title.episodes.find((episode) => {
						return episode.episode_number === content.episode;
					});
					if (episode != null) {
						if (content.summary !== episode.description) {
							console.log(content);
							content.summary = episode.description;
						}
					}
					metadata.getTitle(content.imdb_show, (title) => {
						if (title != null) {
							content.actors_show = title.stars.map((star) => {
								return star.name;
							});
						}
						next();
					});
				});
			} else if (discdb.MovieContent.is(content)) {
				metadata.getTitle(content.imdb, (title) => {
					if (title != null) {
						if (content.summary !== title.description) {
							console.log(content);
							content.summary = title.description;
						}
						content.actors = title.stars.map((star) => {
							return star.name;
						});
					}
					next();
				});
			} else {
				next();
			}
		}, next);
	} else {
		next();
	}
}, () => {
	libfs.writeFileSync("./private/db/discdb_new.json", JSON.stringify(db, null, "\t"));
});
