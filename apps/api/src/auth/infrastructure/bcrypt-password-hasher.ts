import { Injectable } from "@nestjs/common";
import { compare, hash } from "bcrypt";
import { PasswordHasher } from "../domain/ports";

export const BCRYPT_COST = 12;

@Injectable()
export class BcryptPasswordHasher extends PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return hash(plainPassword, BCRYPT_COST);
  }

  async compare(plainPassword: string, passwordHash: string): Promise<boolean> {
    return compare(plainPassword, passwordHash);
  }
}
