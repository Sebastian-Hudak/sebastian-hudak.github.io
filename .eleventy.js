globalThis.self = globalThis; // 👈 first line, before any other require()

const Image = require("@11ty/eleventy-img");
const path = require("path");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("robots.txt");

  // {% image "path", "alt", [widths], [formats], "sizes", "class", "lazy|eager" %}
  eleventyConfig.addNunjucksAsyncShortcode("image", async function (
    src,
    alt,
    widths = [480, 900, 1600],
    formats = ["avif", "webp", "jpeg"],
    sizes = "100vw",
    cls = "",
    loading = "lazy"
  ) {
    if (alt === undefined) {
      throw new Error(`Missing \`alt\` on image shortcode for: ${src}`);
    }

    const inputPath = String(src).startsWith("http")
      ? src
      : path.join(process.cwd(), String(src).replace(/^\.?\//, ""));

    const metadata = await Image(inputPath, {
      widths,
      formats,
      outputDir: "_site/img",
      urlPath: "/img",
      filenameFormat: (id, srcPath, width, format) => {
        const name = srcPath.split("/").pop().split(".")[0];
        return `${name}-${width}w.${format}`;
      },
    });

    return Image.generateHTML(metadata, {
      alt,
      sizes,
      loading,
      decoding: "async",
      class: cls,
    });
  });

  eleventyConfig.addPassthroughCopy({ "assets/images/page/logo_set/favicons": "/" });

  // ✅ Simple default-responsive command
  // {% img "path", "alt", "optional-class", "lazy|eager" %}
  eleventyConfig.addNunjucksAsyncShortcode("img", async function (
    src,
    alt,
    cls = "",
    loading = "lazy"
  ) {
    if (alt === undefined) {
      throw new Error(`Missing \`alt\` on img shortcode for: ${src}`);
    }

    const inputPath = String(src).startsWith("http")
      ? src
      : path.join(process.cwd(), String(src).replace(/^\.?\//, ""));

    const metadata = await Image(inputPath, {
  widths: [480, 900, 1600],
  formats: ["avif", "webp", "jpeg"],
  outputDir: "_site/img",
  urlPath: "/img",
  filenameFormat: (id, srcPath, width, format) => {
    const name = srcPath.split("/").pop().split(".")[0];
    return `${name}-${width}w.${format}`;
  },
});

    return Image.generateHTML(metadata, {
      alt,
      sizes: "100vw",
      loading,
      decoding: "async",
      class: cls,
    });
  });

  return {
    dir: { input: ".", includes: "_includes", output: "_site" },
    templateFormats: ["html", "njk", "md"],
    htmlTemplateEngine: "njk",
  };
};