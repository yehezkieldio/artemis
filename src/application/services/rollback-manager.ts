import { okAsync, type ResultAsync } from "neverthrow";
import type { ArtemisContext } from "#/application/context";
import { logger } from "#/infrastructure/logging";

export type RollbackOperation = {
    operation: (context: ArtemisContext) => ResultAsync<void, Error>;
    description: string;
};

export function createRollbackStack(): RollbackOperation[] {
    return [];
}

export function executeWithRollback<T>(
    operation: (context: T) => ResultAsync<T, Error>,
    rollbackOp: ((context: ArtemisContext) => ResultAsync<void, Error>) | null,
    description: string,
    context: T,
    rollbackStack: RollbackOperation[],
    shouldSkip?: (context: T) => boolean
): ResultAsync<T, Error> {
    if (shouldSkip?.(context)) {
        logger.verbose(`Skipping step: ${description}`);
        return okAsync(context);
    }

    logger.verbose(`${description}...`);
    return operation(context).map((result: T): T => {
        if (rollbackOp) {
            addRollbackOperation(rollbackStack, rollbackOp, description);
        }
        return result;
    });
}

export function addRollbackOperation(
    stack: RollbackOperation[],
    operation: (context: ArtemisContext) => ResultAsync<void, Error>,
    description: string
): void {
    stack.push({ operation, description });
}

export function executeRollback(context: ArtemisContext, operations: RollbackOperation[]): ResultAsync<void, Error> {
    if (operations.length === 0) {
        return okAsync<void, Error>(undefined);
    }

    logger.warn("Initiating rollback of failed operations...");

    return operations
        .reverse()
        .reduce((promise: ResultAsync<void, Error>, { operation }: RollbackOperation): ResultAsync<void, Error> => {
            return promise.andThen((): ResultAsync<void, Error> => {
                return operation(context);
            });
        }, okAsync<void, Error>(undefined))
        .mapErr((error: Error): Error => {
            logger.error("Rollback failed:", error);
            return error;
        });
}
