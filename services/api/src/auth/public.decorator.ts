import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'rydo:public';
/** Skips sign-in for this route. */
export const Public = () => SetMetadata(IS_PUBLIC, true);