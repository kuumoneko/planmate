import { Analytics } from "@vercel/analytics/next";
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
    return (
        <Html lang="vi" className="">
            <Head>
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <script
                    dangerouslySetInnerHTML={{
                        __html: 'try{var t=localStorage.getItem("theme");var light=t?t==="light":window.matchMedia("(prefers-color-scheme: light)").matches;if(light)document.documentElement.classList.remove("dark");else document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}',
                    }}
                />
            </Head>
            <body className="antialiased">
                <Main />
                <NextScript />
                <Analytics />
            </body>
        </Html>
    );
}
