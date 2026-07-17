import { fireEvent, render, screen } from "@testing-library/react";
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
});
