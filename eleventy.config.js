const autoprefixer = require('autoprefixer');
const csso = require('postcss-csso');
const dom = require('linkedom');
const esbuild = require('esbuild');
const fs = require('fs');
const highlight = require('@11ty/eleventy-plugin-syntaxhighlight');
const htmlmin = require('html-minifier-terser');
const markdown = require('markdown-it')({ html: true });
const minmax = require('postcss-media-minmax');
const pimport = require('postcss-import');
const postcss = require('postcss');
const prettydata = require('pretty-data');
const rss = require('@11ty/eleventy-plugin-rss');
const yaml = require('js-yaml');

const global = yaml.load(
    fs.readFileSync('src/data/global.yml', 'utf8')
);

module.exports = (config) => {
    // Collections

    const collections = {
        'articles': 'src/articles/*/index.md',
        'pages': 'src/pages/!(404)/index.njk',
    };

    config.addCollection('articles', (collectionApi) => {
        return collectionApi.getFilteredByGlob(
            collections.articles
        ).filter(
            article => article.data.draft !== true
        );
    });

    config.addCollection('sitemap', (collectionApi) => {
        return collectionApi.getFilteredByGlob([
            collections.articles,
            collections.pages,
        ]).filter(
            article => article.data.draft !== true
        );

    });

    // Markdown

    config.addFilter('markdown', (value) => {
        return markdown.render(value);
    });

    config.addFilter('markdownInline', (value) => {
        return markdown.renderInline(value);
    });

    config.setLibrary('md', markdown);

    // HTML

    config.addTransform('html-minify', (content, path) => {
        if (path && path.endsWith('.html')) {
            return htmlmin.minify(
                content, {
                    collapseBooleanAttributes: true,
                    collapseWhitespace: true,
                    decodeEntities: true,
                    includeAutoGeneratedTags: false,
                    removeComments: true,
                    sortAttributes: true,
                    sortClassName: true,
                }
            );
        }

        return content;
    });

    const htmlTransforms = [
        require('./src/transforms/anchors.js'),
        require('./src/transforms/demos.js'),
        require('./src/transforms/figure.js'),
        require('./src/transforms/images.js'),
        require('./src/transforms/prism.js'),
    ];

    config.addTransform('html-transform', async (content, path) => {
        if (path && path.endsWith('.html')) {
            const window = dom.parseHTML(content);

            for (const transform of htmlTransforms) {
                await transform(window, content, path);
            }

            return window.document.toString();
        }

        return content;
    });

    // CSS

    const styles = [
        './src/styles/index.css',
        './src/styles/light.css',
        './src/styles/dark.css',
    ];

    config.addTemplateFormats('css');

    config.addExtension('css', {
        outputFileExtension: 'css',
        compile: async (content, path) => {
            if (!styles.includes(path)) {
                return;
            }

            return async () => {
                let output = await postcss([
                    pimport,
                    minmax,
                    autoprefixer,
                    csso,
                ]).process(content, {
                    from: path,
                });

                return output.css;
            }
        }
    });

    config.addNunjucksAsyncFilter('css', (path, callback) => {
        fs.readFile(path, 'utf8', (error, content) => {
            postcss([
                pimport,
                minmax,
                autoprefixer,
                csso,
            ]).process(content, {
                from: path,
            }).then((output) => {
                callback(null, output.css)
            });
        });
    });

    // JavaScript

    config.addTemplateFormats('js');

    config.addExtension('js', {
        outputFileExtension: 'js',
        compile: async (content, path) => {
            if (path !== './src/scripts/index.js') {
                return;
            }

            return async () => {
                return esbuild.buildSync({
                    entryPoints: [path],
                    minify: true,
                    bundle: true,
                    write: false,
                }).outputFiles[0].text;
            }
        }
    });

    // XML minification

    config.addTransform('xmlmin', (content, path) => {
        if (path && path.endsWith('.xml')) {
            return prettydata.pd.xmlmin(content);
        }

        return content;
    });

    // YAML

    config.addDataExtension('yml', (contents) => {
        return yaml.load(contents);
    });

    // Absolute links

    config.addFilter('absolute', (post) => {
        const reg = /(src="[^(https://)])|(src="\/)|(href="[^(https://)])|(href="\/)/g;
        const prefix = global.domain + post.url;
        return post.templateContent.replace(reg, (match) => {
            if (match === 'src="/' || match === 'href="/') {
                match = match.slice(0, -1);
                return match + prefix;
            } else {
                return match.slice(0, -1) + prefix + match.slice(-1);
            }
        });
    });

    // Dates

    config.addFilter('dateLong', (value) => {
        return value.toLocaleString('en', {
            dateStyle: 'long',
        });
    });

    config.addFilter('dateShort', (value) => {
        const articleYear = value.getFullYear();
        const currentYear = new Date().getFullYear();
        const dateFormat = articleYear < currentYear
            ? {
                dateStyle: 'long',
            }
            : {
                month: 'long',
                day: 'numeric',
            };

        return value.toLocaleString('en', dateFormat);
    });

    config.addFilter('dateISO', (value) => {
        return value.toISOString().split('T')[0];
    });

    // Passthrough copy

    [
        'src/robots.txt',
        'src/images',
        'src/fonts',
        'src/talks',
        'src/articles/**/*.!(md)',
    ].forEach(
        path => config.addPassthroughCopy(path)
    );

    // Plugins

    config.addPlugin(rss);
    config.addPlugin(highlight);

    // Config

    return {
        dir: {
            input: 'src',
            output: 'dist',
            includes: 'includes',
            layouts: 'layouts',
            data: 'data'
        },
        dataTemplateEngine: 'njk',
        markdownTemplateEngine: 'njk',
        htmlTemplateEngine: 'njk',
        templateFormats: [
            'md', 'njk'
        ],
    };
};
