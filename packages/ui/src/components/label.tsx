import { Field } from "@base-ui/react/field";

import { cn } from "@workspace/ui/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof Field.Label>) {
  return (
    <Field.Label
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-none select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
