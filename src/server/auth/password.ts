import bcrypt from "bcryptjs";

// bcrypt, cost 10: the format the previous auth system used, so migrated accounts keep their existing hashes and still sign in.
const COST = 10;

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, COST);

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false; // a malformed stored hash must read as "wrong password", not as a server error
  }
}
