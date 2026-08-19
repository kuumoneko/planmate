export default function Logo({
    height = 20,
    width = 20,
}: {
    height?: number;
    width?: number;
}) {
    return (
        <img
            src="/nozal.png"
            alt="Logo"
            height={height}
            width={width}
            className="inline-flex items-center justify-center rounded-full object-cover"
            style={{ height, width }}
            title="Sinh viên"
        />
    );
}
