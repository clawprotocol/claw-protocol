import { useMemo, useRef, useState } from "react";
import type { AdaptedRecipientSessionPacket } from "./recipientSessionPacketAdapter";
import { RecipientSigningFieldOverlay } from "./RecipientSigningFieldOverlay";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";
import {
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "./buildVs01SigningPacketModel";

type Props = {
  packet: AdaptedRecipientSessionPacket;
};

export function RecipientSessionPacketReview({ packet }: Props) {
  const pagesInnerRef = useRef<HTMLDivElement>(null);
  const pageStackRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const numPages = packet.model.pages.length;
  const cpById = useMemo(
    () => new Map(packet.counterparties.map((cp) => [cp.id, cp] as const)),
    [packet.counterparties],
  );

  const registerPageStack = (pageIndex: number, el: HTMLDivElement | null) => {
    if (el) pageStackRefs.current.set(pageIndex, el);
    else pageStackRefs.current.delete(pageIndex);
  };

  const goPage = (next: number) => {
    const clamped = Math.max(1, Math.min(numPages, next));
    setCurrentPage(clamped);
    window.requestAnimationFrame(() =>
      pageStackRefs.current.get(clamped - 1)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <div
      key={packet.projection.packet_revision}
      className="vs01-recipient-session-packet-review"
      data-testid="recipient-session-packet-review"
    >
      <header className="vs01-recipient-signing-header">
        <h2 className="vs01-card__title">{packet.projection.document_label}</h2>
        <p className="vs01-card__subtitle">
          Review the agreement and your assigned fields. Signing will be enabled in a future update.
        </p>
      </header>

      <div className="vs01-recipient-signing-doc-wrap">
        <div className="vs01-sign-page-bar" aria-label="Page navigation">
          <button type="button" className="vs01-sign-page-btn" disabled={currentPage <= 1} onClick={() => goPage(1)}>
            Top
          </button>
          <button
            type="button"
            className="vs01-sign-page-btn"
            disabled={currentPage <= 1}
            onClick={() => goPage(currentPage - 1)}
          >
            Prev
          </button>
          <span className="vs01-sign-page-label">
            Page {currentPage} of {numPages}
          </span>
          <button
            type="button"
            className="vs01-sign-page-btn"
            disabled={currentPage >= numPages}
            onClick={() => goPage(currentPage + 1)}
          >
            Next
          </button>
          <button
            type="button"
            className="vs01-sign-page-btn"
            disabled={currentPage >= numPages}
            onClick={() => goPage(numPages)}
          >
            Bottom
          </button>
        </div>

        <div className="vs01-sign-scroll vs01-recipient-signing-scroll">
          <div
            className="vs01-sign-doc-pages-wrap vs01-sign-doc-surface vs01-sign-doc-surface--bridge"
            data-testid="vs01-recipient-session-canonical-render"
          >
            <div ref={pagesInnerRef} className="vs01-sign-pages-inner">
              {packet.model.pages.map((page) => {
                const fieldsHere = packet.fields.filter((field) => field.page === page.pageIndex);
                return (
                  <div
                    key={page.pageIndex}
                    ref={(el) => registerPageStack(page.pageIndex, el)}
                    className="vs01-sign-page-stack"
                    data-vs01-sign-page={page.pageIndex}
                  >
                    <div
                      className="vs01-sign-page-surface vs01-sign-page-surface--canonical"
                      style={{
                        width: VS01_PACKET_PAGE_WIDTH_PT,
                        height: VS01_PACKET_PAGE_HEIGHT_PT,
                      }}
                    >
                      <Vs01CanonicalSigningPage page={page} pageWidthPx={VS01_PACKET_PAGE_WIDTH_PT} />
                      <div className="vs01-sign-page-placement-host">
                        <div
                          className="vs01-sign-overlay vs01-sign-overlay--placed"
                          role="presentation"
                        >
                          {fieldsHere.map((field) => (
                            <RecipientSigningFieldOverlay
                              key={field.id}
                              field={field}
                              lockedCounterpartyId={packet.lockedCounterpartyId}
                              lockedSignerRoleId={packet.lockedSignerRoleId}
                              recipientAgreementId={null}
                              cpById={cpById}
                              onUpdateValue={() => {}}
                              canonicalCompact
                              readOnlyReview
                              signerCount={2}
                              pageFieldObstacles={fieldsHere
                                .filter((candidate) => candidate.id !== field.id)
                                .map((candidate) => ({
                                  x: candidate.x,
                                  y: candidate.y,
                                  width: candidate.width,
                                  height: candidate.height,
                                }))}
                              pageTextRects={page.textBlocks.map((text) => ({
                                x: text.x,
                                y: text.y,
                                width: text.width,
                                height: text.height,
                              }))}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
