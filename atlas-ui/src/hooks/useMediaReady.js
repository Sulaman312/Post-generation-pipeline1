import { useCallback, useEffect, useState } from "react";

/** Reset when `key` changes; set ready when paired image finishes loading. */
export function useMediaReady(key) {
  const [mediaReady, setMediaReady] = useState(false);

  useEffect(() => {
    setMediaReady(false);
  }, [key]);

  const onMediaLoad = useCallback(() => {
    setMediaReady(true);
  }, []);

  return { mediaReady, onMediaLoad };
}
