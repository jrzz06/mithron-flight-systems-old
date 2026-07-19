import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";

const useFormStatusMock = vi.fn(() => ({ pending: false }));

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: () => useFormStatusMock()
  };
});

describe("OperationalSubmitButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useFormStatusMock.mockReturnValue({ pending: false });
  });

  it("does not lock the button before the browser accepts form validation", () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <input name="price" required />
        <OperationalSubmitButton pendingLabel="Publishing">Publish</OperationalSubmitButton>
      </form>
    );

    const button = screen.getByRole("button", { name: "Publish" });
    fireEvent.click(button);

    expect(button).not.toHaveAttribute("disabled");
    expect(onSubmit).toHaveBeenCalledTimes(0);
  });

  it("shows the pending label while the server action is in flight", () => {
    useFormStatusMock.mockReturnValue({ pending: true });

    render(
      <form>
        <OperationalSubmitButton pendingLabel="Publishing">Publish</OperationalSubmitButton>
      </form>
    );

    const button = screen.getByRole("button", { name: "Publishing" });
    expect(button).toHaveAttribute("disabled");
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("prefers the busy override over useFormStatus so Saving can clear after the action returns", () => {
    useFormStatusMock.mockReturnValue({ pending: true });

    render(
      <form>
        <OperationalSubmitButton busy={false} pendingLabel="Saving">
          I contacted the customer
        </OperationalSubmitButton>
      </form>
    );

    const button = screen.getByRole("button", { name: "I contacted the customer" });
    expect(button).not.toHaveAttribute("disabled");
    expect(button).toHaveAttribute("aria-busy", "false");
  });

  it("shows pending when busy override is true even if useFormStatus is idle", () => {
    useFormStatusMock.mockReturnValue({ pending: false });

    render(
      <form>
        <OperationalSubmitButton busy pendingLabel="Saving">
          I contacted the customer
        </OperationalSubmitButton>
      </form>
    );

    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toHaveAttribute("disabled");
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("opens a confirmation dialog and blocks submit until confirmed", () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <OperationalSubmitButton confirmMessage="Cancel this order?" pendingLabel="Cancelling">
          Cancel order
        </OperationalSubmitButton>
      </form>
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(onSubmit).toHaveBeenCalledTimes(0);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Cancel this order?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps type-to-confirm disabled until the typed phrase matches", () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <OperationalSubmitButton
          confirmMessage="Permanently delete order ORD-1?"
          requireTypedText="ORD-1"
          typedTextLabel="Type ORD-1 to permanently delete"
          confirmLabel="Delete permanently"
          pendingLabel="Deleting"
        >
          Delete order
        </OperationalSubmitButton>
      </form>
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete order" }));
    const dialog = screen.getByRole("dialog");
    const dialogConfirm = within(dialog).getByRole("button", { name: "Delete permanently" });
    expect(dialogConfirm).toBeDisabled();

    const input = within(dialog).getByPlaceholderText("ORD-1");
    fireEvent.change(input, { target: { value: "ORD-" } });
    expect(dialogConfirm).toBeDisabled();

    fireEvent.change(input, { target: { value: "ORD-1" } });
    expect(dialogConfirm).not.toBeDisabled();

    fireEvent.click(dialogConfirm);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
