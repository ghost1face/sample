import { StyleSheet, Button, NativeModules, View } from "react-native";
import { useNavigation } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { RefObject, useEffect, useRef, useState } from "react";
import PSPDFKitView, { PDFConfiguration } from "react-native-pspdfkit";
import { useAssets } from "expo-asset";

NativeModules.PSPDFKit.setLicenseKeys(null, null);

export default function HomeScreen() {
  const [assets, _error] = useAssets([require("../../assets/sample.pdf")]);

  if (!assets || !assets.length) return null;

  return <PDFEditor pdfUrl={assets[0].uri} />;
}

type PSPDFKitAnnotation = {
  v: number;
  createdAt: string;
  creatorName: string;
  pageIndex: number;
  type: string;
  note: string;
  bbox: [number, number, number, number];
  formFieldName?: string;
  isRequired: boolean;
};

type PSPDFKitAnnotations = {
  annotations: any[];
  format?: "https://pspdfkit.com/instant-json/v1";
};

const Thread = {
  sleep: (timeout: number) =>
    new Promise((resolve) => setTimeout(resolve, timeout)),
};

export function PDFEditor({ pdfUrl }: { pdfUrl: string }) {
  const navigation = useNavigation();
  const pdfRef = useRef<PSPDFKitView | null>();

  useEffect(() => {
    const removeListener = navigation.addListener("beforeRemove", (_e) => {
      pdfRef.current?.destroyView();
    });

    return () => {
      removeListener();
    };
  }, [navigation, pdfRef]);

  useEffect(() => {
    (async () => {
      await ScreenOrientation.unlockAsync();
    })();

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    };
  }, []);

  const [signature, setSignature] = useState<PSPDFKitAnnotation | null>(null);
  const isApplyingSignature = useRef<boolean>(false);

  useEffect(() => {
    async function applySignatureToAllSignatureFields() {
      if (!pdfRef.current) return;
      if (!signature) return;

      const document = pdfRef.current.getDocument();
      const annotations = await document.getAnnotations();

      const signatureFields = annotations.filter(
        (annotation: PSPDFKitAnnotation) =>
          annotation.formFieldName?.startsWith("SIGNATURE_")
      );

      isApplyingSignature.current = true;

      const addAnnotationObject: PSPDFKitAnnotations = {
        annotations: [],
        format: "https://pspdfkit.com/instant-json/v1",
      };

      // clone signature annotation & apply new bbox
      // and pageIndex of other signature fields that match
      let index = 0;
      for (const signatureField of signatureFields) {
        if (index++ === 0) continue;

        const clonedSignature = JSON.parse(JSON.stringify(signature));

        // clonedSignature.name = new Date().getTime() * Math.random();
        clonedSignature.bbox = signatureField.bbox;
        clonedSignature.pageIndex = signatureField.pageIndex;

        addAnnotationObject.annotations.push(clonedSignature);
      }

      // apply annotation - if you tap the signature field on the 2nd page
      // you'll get an outline of a signature annotation tied to the bounding
      // box of the form element. Dragging or stretching the annotation will
      // make the annotation finally visible
      await document.addAnnotations(addAnnotationObject);

      // I exposed moveAnnotation to the react side here
      // to set the zIndex but that does not work either

      // have also tried invoking forceUpdate but that
      // does not seem to work

      // arbitrary wait to prevent infinite loop
      // since onAnnotationEvent is queued and dispatched
      await Thread.sleep(1000);

      isApplyingSignature.current = false;
    }

    applySignatureToAllSignatureFields();
  }, [pdfRef, signature]);

  return (
    <View style={{ flex: 1, paddingTop: 50 }}>
      <PSPDFKitView
        document={pdfUrl}
        hideNavigationBar={false}
        hideDefaultToolbar={false}
        onNavigationButtonClicked={() => {
          navigation.goBack();
        }}
        onAnnotationsChanged={(annotationChangeData: any) => {
          if (isApplyingSignature.current) return;
          if (annotationChangeData.change === "removed") return;

          // take first annotation on the array, there should only be one
          // store this in state
          setSignature(annotationChangeData.annotations[0]);
        }}
        showNavigationButtonInToolbar={false}
        configuration={{
          androidShowSettingsMenu: false,
          androidShowShareAction: false,
          iOSShouldAskForAnnotationUsername: false,
          showThumbnailBar: PDFConfiguration.ShowThumbnailBar.SCROLLABLE,
          pageTransition: PDFConfiguration.PageTransition.SCROLL_CONTINUOUS,
          scrollDirection: PDFConfiguration.ScrollDirection.VERTICAL,
          signatureSavingStrategy:
            PDFConfiguration.SignatureSavingStrategy.NEVER_SAVE,
        }}
        ref={pdfRef as RefObject<PSPDFKitView>}
        style={[styles.container]}
      />
      <Button
        title="DEBUG"
        onPress={() => {
          pdfRef.current
            ?.getDocument()
            .getAllUnsavedAnnotations()
            .then((annotation) => {
              console.debug("DEBUG: ", JSON.stringify(annotation));
            });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
