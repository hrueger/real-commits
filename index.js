const express = require("express");
const { badgen } = require("badgen");
const fs = require("fs");
const path = require("path");
const app = express();
let { graphql } = require("@octokit/graphql");
const token = process.env.GHTOKEN ? process.env.GHTOKEN : fs.readFileSync(path.join(__dirname, "token.secret"));
const client = graphql.defaults({
    headers: {
        authorization: `token ${token}`
    }
});
const cache = {};

const port = 8080;
let server = app.listen(port, function () {
    console.log(`Application successfully started on port ${port}!`);
});

app.get("/:user/:repo", async function (req, res) {
    const id = `${req.params.user}/${req.params.repo}`;
    console.log(`Processing request for ${id}`)
    res.writeHead(200, {
        "Content-Type": "image/svg+xml"
    });
    let value = "";

    if (cache[id]) {
        value = cache[id];
        console.log(`${id} served from cache!`);
    } else {
        value = "Loading";
    }
    setTimeout(async () => {
        let commits = [];
        let after = undefined;
        try {
            while (true) {
                const result = await client({
                    query: `query ($owner: String!, $name: String!) {
                        repository(owner: $owner, name: $name) {
                            object(expression: "master") {
                                ... on Commit {
                                history(first:100, ${after ? `, after: "${after}"` : ""}) {
                                    nodes {
                                    author {
                                        name
                                    }
                                    }
                                    pageInfo {
                                    endCursor
                                    hasNextPage
                                    }
                                }
                                }
                            }
                        }
                    }`,
                    owner: req.params.user,
                    name: req.params.repo
                });
                if (result.repository.object.history.nodes) {
                    commits.push(...result.repository.object.history.nodes);
                }
                if (result.repository.object.history.pageInfo.hasNextPage) {
                    after = result.repository.object.history.pageInfo.endCursor;
                } else {
                    break;
                }
            }
            commits = commits.filter((c) => !c.author.name.endsWith("[bot]"));
            cache[id] = commits.length.toString();
            console.log(`${id} loaded in cache!`);
        } catch (error) {
            console.log("Request failed:", error.request);
            console.log(error.message);
            console.log(error.data);
        }
    });

    
    const options = {
        label: req.query.label ? req.query.label : "Real commits",
        color: req.query.color ? req.query.color : "cyan",
        style: req.query.style ? req.query.style : "classic",
        scale: req.query.scale ? req.query.scale : 1,
        value: value ? value : "Repo not found",
    }
    const badge = badgen({
        label: options.label,
        status: options.value,
        color: options.color,
        style: options.style,
        scale: options.scale,
    })
    res.write(badge);
    res.end();
});