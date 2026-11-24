import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

@ValidatorConstraint({ name: "passwordsMatch", async: false })
export class PasswordsMatchConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: unknown, args: ValidationArguments): boolean {
    const password = Reflect.get(args.object, "password");

    return typeof confirmPassword === "string" && confirmPassword === password;
  }

  defaultMessage(): string {
    return "password and confirmPassword must match";
  }
}
