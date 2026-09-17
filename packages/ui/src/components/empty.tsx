import { cn } from "@workspace/ui/lib/utils";

function Empty({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Empty };
