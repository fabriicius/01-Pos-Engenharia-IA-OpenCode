import { IsNotEmpty, IsString } from "class-validator";
import { ConfirmAccountInput } from "../../application/confirm-account.use-case";

export class ConfirmAccountRequestDto implements ConfirmAccountInput {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
