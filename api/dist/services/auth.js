import { getToken } from "next-auth/jwt";
export async function requireUser(req) {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret)
        throw new Error("Missing NEXTAUTH_SECRET");
    const token = await getToken({ req: req, secret });
    const email = token?.email;
    if (!email) {
        const err = new Error("Unauthorized");
        err.status = 401;
        throw err;
    }
    return { email };
}
