import { MetaCalcDB } from './db';
import { getImage } from './dataIndex';
import { notifyMetadataChange } from './imageChangeHub';

export function setImageAnnotation(id: string, annotation: string): void {
    MetaCalcDB.setAnnotation(id, annotation);
    const image = getImage(id);
    if (image)
        image.annotation = annotation;
    notifyMetadataChange(id);
}
