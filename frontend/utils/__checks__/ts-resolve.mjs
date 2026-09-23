// Node ESM requires explicit file extensions; Metro does not. Rather than put
// `.ts` extensions in application imports (which the bundler would then have
// to agree with), this resolve hook retries a failed relative specifier with
// `.ts` appended. It exists only for `npm run check` and is never bundled.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw error;
  }
}
