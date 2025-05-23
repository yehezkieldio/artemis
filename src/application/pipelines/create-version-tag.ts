import { colors } from "consola/utils";
import { errAsync, okAsync, type ResultAsync } from "neverthrow";
import type { ArtemisContext } from "#/application/context";
import { resolveTagName } from "#/infrastructure/config";
import { executeGit } from "#/infrastructure/git";
import { logger } from "#/infrastructure/logging";

export function createVersionTagPipeline(context: ArtemisContext): ResultAsync<ArtemisContext, Error> {
    return createTag(context).map((): ArtemisContext => {
        return context;
    });
}

function createTag(context: ArtemisContext) {
    const tagName: string = resolveTagName(context);

    if (context.options.dryRun) {
        logger.info(`Create tag ${colors.dim(tagName)} ${colors.yellow("(dry run)")}`);
        return okAsync(context);
    }

    return checkIfTagExists(tagName)
        .andThen((exists: boolean): ResultAsync<ArtemisContext, Error> => {
            if (exists) {
                return errAsync(new Error(`Tag ${tagName} already exists`));
            }
            return canSignGitTag()
                .andThen((canSign: boolean) => {
                    logger.verbose("Can sign tag:", canSign);
                    const baseArgs: string[] = ["tag", "-a", tagName];
                    const args: string[] = canSign ? [...baseArgs, "-s"] : baseArgs;
                    return executeGit(args);
                })
                .map((): ArtemisContext => context);
        })
        .andTee((): void => logger.info(`Created tag ${colors.dim(tagName)}`));
}

function canSignGitTag(): ResultAsync<boolean, Error> {
    return executeGit(["config", "--get", "user.signingkey"]).map((key: string): boolean => {
        if (key.trim() === "") {
            return false;
        }
        return true;
    });
}

function checkIfTagExists(tagName: string): ResultAsync<boolean, Error> {
    return executeGit(["tag", "-l", tagName]).map((output: string): boolean => {
        return output.trim() !== "";
    });
}

export function rollbackCreateVersionTagPipeline(context: ArtemisContext): ResultAsync<void, Error> {
    if (context.options.dryRun) {
        logger.info(`Would rollback tag ${colors.dim(resolveTagName(context))} ${colors.yellow(" (dry run)")}`);
        return okAsync(undefined);
    }

    const tagName: string = resolveTagName(context);

    return executeGit(["tag", "-d", tagName])
        .andTee((): void => {
            logger.info(`Rolled back tag ${colors.dim(tagName)}`);
        })
        .map((): void => undefined);
}
