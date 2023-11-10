
const githubToken = ""; // classic github personal access token
const gitlabToken = ""; // gitlab personal access token
const authorName = ""; // author name of commits (eg Marco Rossi)
const mockRepoName = "my-contributions"; // the github repo that will be created in order to transfer contributions
const owner = ""; // github repository owner 
const email = ""; // github email

(async () => {
    let authHeader = {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github+json"
    }
    await fetch(`https://api.github.com/repos/${owner}/${mockRepoName}`, {
        headers: authHeader
    }).catch((err) => console.error(err))
        .then(async (resp) => {
            if (resp.status === 404) {
                await fetch(`https://api.github.com/user/repos`, {
                    headers: authHeader,
                    method: "POST",
                    body: `{
                        "name": "${mockRepoName}",
                        "private": true,
                        "description": "My contributions",
                        "auto_init": true
                    }`
                }).catch((err) => console.error(err))
                    .then((response) => response.json())
            }
        })

    const groups = await fetch(`https://gitlab.com/api/v4/groups?private_token=${gitlabToken}`)
        .catch((err) => console.error(err))
        .then((response) => response.json());


    await Promise.all(
        groups.map(async (group) => {
            return await fetch(`https://gitlab.com/api/v4/groups/${group["id"]}?private_token=${gitlabToken}&all=true&author=${authorName}`)
                .catch((err) => console.error(err))
                .then((response) => response.json())
        }))
        .catch((err) => console.error(err))
        .then(async (fullGroups) => {
            const projects = fullGroups.flatMap((obj) => obj["projects"])
            return await Promise.all(projects.map(async (project) => {
                return await fetch(`https://gitlab.com/api/v4/projects/${project["id"]}/repository/commits?private_token=${gitlabToken}&all=true&author=${authorName}`)
                    .catch((err) => console.error(err))
                    .then((response) => response.json())
            }))

        })
        .then(async (commitList) => {
            const tree = await fetch(`https://api.github.com/repos/${owner}/${mockRepoName}/git/trees`,
                {
                    method: "POST",
                    headers: authHeader,
                    body: `
                    {
                        "tree": [
                            {
                                "path": "README.md",
                                "mode": "100644",
                                "type": "blob",
                                "content": "_"
                            }
                        ]
                    }`})
                .then((response) => response.json())

            const commits = commitList.filter((commits) => commits.length)
                .flatMap((list) => list)

            const shas = await Promise.all(commits.map(async (commit) => {
                const res = await fetch(`https://api.github.com/repos/${owner}/${mockRepoName}/git/commits`,
                    {
                        method: "POST",
                        headers: authHeader,
                        body: `{ "message": "${commit["title"]}",
                                "author" : {
                                    "name": "${authorName}",
                                    "email": "${email}",
                                    "date": "${commit["committed_date"]}"
                                },
                                "tree": "${tree["sha"]}"
                            }`
                    }).then((response) => response.json())

                return res["sha"]

            }))

            const mergeCommit = await fetch(`https://api.github.com/repos/${owner}/${mockRepoName}/git/commits`,
                {
                    method: "POST",
                    headers: authHeader,
                    body: `{ "message": "merge commit",                           
                                "tree": "${tree["sha"]}",
                                "parents": ${JSON.stringify(shas)}
                            }`
                }).then((response) => response.json())

            //merge commit
            await fetch(`https://api.github.com/repos/${owner}/${mockRepoName}/git/refs/heads/main`,
                {
                    headers: authHeader,
                    method: "PATCH",
                    body: `{ "sha" : "${mergeCommit["sha"]}", "force": true}`
                })
        })
})();
