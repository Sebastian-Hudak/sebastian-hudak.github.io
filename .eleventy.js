const Image = require("@11ty/eleventy-img");

module.exports = function (eleventyConfig) {
  // Passthrough copies (served as-is)
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("robots.txt");

  // Optional helper for debugging
  // eleventyConfig.addFilter("json", (v) => JSON.stringify(v, null, 2));

  // {% image "path", "alt", [widths], [formats], "sizes", "class", "lazy|eager" %}
  eleventyConfig.addNunjucksAsyncShortcode(
    "image",
    async function (
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

      const metadata = await Image(src, {
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
        loading, // "lazy" (default) or "eager"
        decoding: "async",
        class: cls,
      });
    }
  );

  return {
    dir: {
      input: ".",
      includes: "_includes",
      output: "_site",
    },
    templateFormats: ["html", "njk", "md"],
    htmlTemplateEngine: "njk",
  };
};