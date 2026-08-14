import Sidebar_Top from "./top";
import Sidebar_Groups from "./groups";

export default function Sidebar({ mode }: { mode: "row" | "col" }) {
    const { height, width } = {
        height: mode === "col" ? "h-[25%]" : "h-full",
        width: mode === "col" ? "w-full" : "w-[15%]",
    };
    return (
        <div
            className={`flex flex-col ${height} ${width} items-start justify-evenly mb-2 min-h-0 overflow-y-auto`}
        >
            <Sidebar_Top mode={mode} />
            <Sidebar_Groups />
        </div>
    );
}