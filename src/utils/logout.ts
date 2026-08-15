/**
 * handle Logout
 */
export default function Logout(): void {
    localStorage.setItem("user", JSON.stringify({ name: null }));
    localStorage.removeItem("session");
    localStorage.removeItem("token");
    localStorage.removeItem("expires");
    localStorage.removeItem("offline");
    window.dispatchEvent(new Event("logout"));

}