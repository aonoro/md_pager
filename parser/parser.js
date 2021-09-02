
const fs = require('fs-extra');
const marked = require("marked");
const path = require('path');

const { DOMParser } = require("xmldom");
const { URL } = require("url")

const htmlFile = path.join(__dirname, "./base.html");
const userDir = path.join(__dirname, "../userdata/");
const tocPath = path.join(userDir, "toc.json");
const distDir = path.join(__dirname, "../build/");

fs.emptyDirSync(distDir);

const parser = new DOMParser();

// 目次を読み込む
const getTOC = () => {
    return new Promise((res, rej) => {

        fs.readFile(tocPath, function (error, content) {
            if (error) {
                rej(error);
                return;
            }
            res(JSON.parse(content.toString()));
        });
    });
};

const getHTMLfromMD = (filepath) => {
    return new Promise((res, rej) => {
        fs.readFile(filepath, function (error, content) {
            if (error) {
                console.error(error);
                return;
            }
            const markedHTML = marked(content.toString(), {
                breaks: true
            });
            res(markedHTML);
        });
    });
}

const bindMD = async (document) => {
    const el_toc = document.getElementById("toc");
    const el_contents = document.getElementById("contents");

    // 目次のインデント深さ
    let indent_count = 0;

    /**
     * 目次追加
     * @param {Object} link {title:string, path:string} 
     */
    const addTocAnchor = (link) => {
        const toc_target_id = "toc_target_" + link.title;
        const anchor = document.createElement("a");
        anchor.textContent = link.title;
        if (link.path) {// パス指定があれば
            anchor.setAttribute("href", "#" + toc_target_id);
        }
        anchor.setAttribute("style", "padding-left:" + indent_count * 2 + "em;");
        el_toc.appendChild(anchor);

        return toc_target_id;
    }
    const addPage = async (link, isCover) => {
        // 目次を追加しターゲットのIDを取得
        const id = addTocAnchor(link);

        // パス指定が目次タイトルのみ追加
        if (!link.path) return;

        let div = document.createElement("div");
        div.setAttribute("id", id);
        div.setAttribute("class", "md-file-unit");
        if (isCover) {
            el_contents.insertBefore(div, el_contents.firstChild);
        } else {
            el_contents.insertBefore(div, el_contents.lastChild.nextSibling);
        }

        const mdpath = path.join(userDir + link.path);
        await getHTMLfromMD(mdpath).then(data => {
            const doc = parser.parseFromString(data);
            div.appendChild(doc);
            // アンカーのMDファイルへのリンクを修正する
            const anchors = doc.getElementsByTagName("a");
            for (let i = 0; i < anchors.length; i++) {
                const anchor = anchors[i];
                let href = anchor.getAttribute("href");
                href = decodeURIComponent(href);

                if (href && href.indexOf(".") !== -1) {
                    const url = new URL(href, "relative:///");
                    if (url.pathname.endsWith(".md")) {
                        // 最後のスラッシュを探し
                        const filenamestart = url.pathname.lastIndexOf("/");
                        const filename = url.pathname.slice(filenamestart + 1, -3);
                        const decodedFilename = decodeURIComponent(filename);
                        const hash = url.hash;
                        if (hash) {
                            const decodedHash = decodeURIComponent(hash);
                            anchor.setAttribute("href", decodedHash);
                        } else {
                            anchor.setAttribute("href", "#toc_target_" + decodedFilename);
                        }
                    }
                }
            }


            // 画像リンク直す
            const imgs = doc.getElementsByTagName("img");
            for (let i = 0; i < imgs.length; i++) {
                const img = imgs[i];
                let src = img.getAttribute("src");
                const url = new URL(src, "relative:///");
                // 最後のスラッシュを探し
                const filenamestart = url.pathname.lastIndexOf("/");
                const filename = url.pathname.slice(filenamestart + 1);
                img.setAttribute("src", path.join("img/", filename));
            }
        }).catch(e => {
            console.error(e);
        });
    };

    const lineUpTOCGroup = async (pages) => {
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            await addPage(page);
            if (page.group) {
                indent_count++;
                await lineUpTOCGroup(page.group);
                indent_count--;
            }
        }
    };

    // 各ファイル読込
    await getTOC().then(async data => {
        // 表紙の目次とページを読込追加
        await addPage(data.cover, true);
        // 各ページのリンクの作成
        const pages = data.pages;
        await lineUpTOCGroup(pages);
    }).catch(e => {
        console.error(e);
    });
}

// 元になるHTMLを読み込む
fs.readFile(htmlFile, async function (error, content) {
    if (error) {
        console.error(error);
        return;
    }
    const document = parser.parseFromString(content.toString());
    await bindMD(document);

    fs.writeFile(path.join(distDir, "/index.html"), document.toString(), (err) => {
        if (err) throw err;
        console.log('written');
    });
});

fs.copy(path.join(__dirname, "/lib"), path.join(distDir, "/lib")).then(() => {
    console.log('lib copied');
}).catch(e => {
    console.error(e);
});

fs.copy(path.join(userDir, "/img"), path.join(distDir, "/img")).then(() => {
    console.log('img copied');
}).catch(e => {
    console.error(e);
});