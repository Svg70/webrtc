import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator((data: any, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();

  if (req.user) {
    // Map the 'sub' field from Keycloak token to 'id'
    const user = {
      ...req.user,
      id: req.user.sub,
      username: req.user.preferred_username,
    };

    return data ? user[data] : user;
  }
});
