globalThis.self = globalThis; // 👈 first line, before any other require()

const Image = require("@11ty/eleventy-img");
const path = require("path");
const responsiveWidths = [400, 800, 1200, 1600];
const defaultSizes = "(max-width: 700px) 100vw, (max-width: 1100px) 92vw, 50vw";

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.on("eleventy.before", async () => {
    const heroBackgrounds = [
      "assets/images/page/sebastian-hudak-engineering-hero.png",
      "assets/images/page/sebastian-hudak-engineering-hero-inverted.png"
    ];

    await Promise.all(
      heroBackgrounds.map((src) =>
        Image(path.join(process.cwd(), src), {
          widths: [480, 900, 1400],
          formats: ["avif", "webp"],
          outputDir: "_site/img",
          urlPath: "/img",
          filenameFormat: (id, srcPath, width, format) => {
            const name = srcPath.split("/").pop().split(".")[0];
            return `${name}-${width}w.${format}`;
          },
        })
      )
    );
  });
  eleventyConfig.addFilter("json", function (value) {
    return JSON.stringify(value ?? {});
  });
  eleventyConfig.addFilter("projectById", function (projectMap, id) {
    if (!projectMap || !id) return null;
    return projectMap[id] || null;
  });

  // {% image "path", "alt", [widths], [formats], "sizes", "class", "lazy|eager", "high|auto" %}
  eleventyConfig.addNunjucksAsyncShortcode("image", async function (
    src,
    alt,
    widths = responsiveWidths,
    formats = ["avif", "webp", "jpeg"],
    sizes = defaultSizes,
    cls = "",
    loading = "lazy",
    fetchpriority = "auto"
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

    const attributes = {
      alt,
      sizes,
      loading,
      decoding: "async",
      class: cls,
    };

    if (fetchpriority === "high" || fetchpriority === "low") {
      attributes.fetchpriority = fetchpriority;
    }

    return Image.generateHTML(metadata, attributes);
  });

  eleventyConfig.addPassthroughCopy({ "assets/images/page/logo-set/favicons": "/" });

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
      widths: responsiveWidths,
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
      sizes: defaultSizes,
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
