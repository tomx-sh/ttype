import type { Metadata } from "next";
import { TerminalEditor } from "@/components/terminal-editor";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${site.url}/#website`,
      name: site.name,
      url: site.url,
      description: site.description,
      inLanguage: "en",
    },
    {
      "@type": "WebApplication",
      "@id": `${site.url}/#app`,
      name: site.name,
      url: site.url,
      description: site.description,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires a modern browser with JavaScript enabled.",
      isAccessibleForFree: true,
      image: `${site.url}/opengraph-image.png`,
      isPartOf: { "@id": `${site.url}/#website` },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json">
        {JSON.stringify(structuredData).replace(/</g, "\\u003c")}
      </script>
      <TerminalEditor />
    </>
  );
}
