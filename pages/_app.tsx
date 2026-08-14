"use client";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Template from "./template";

export default function App({ Component, pageProps }: AppProps) {
    return (
        <Template>
            <Component {...pageProps} />
        </Template>
    );
}
