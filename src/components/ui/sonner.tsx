"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = (props: ToasterProps) => (
  <Sonner
    className="toaster"
    toastOptions={{
      unstyled: true,
      classNames: {
        toast: "sonner-toast",
        title: "sonner-toast-title",
        description: "sonner-toast-description",
        actionButton: "sonner-toast-action",
        cancelButton: "sonner-toast-cancel",
      },
    }}
    {...props}
  />
);

export { Toaster };
